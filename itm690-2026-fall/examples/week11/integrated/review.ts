/**
 * 검토단 소집: 대시보드의 포트폴리오 현황을 입력으로, 역할이 다른 모델 셋을 OpenRouter로 호출한다.
 *   의견 A(강세) · 의견 B(약세) 병렬 → 리스크·검증(두 의견 입력) → 코드가 종합.
 * 역할 정의서는 prompts/advisor-*.md, 키는 환경변수 OPENROUTER_API_KEY (.env 에서 읽는다).
 * 모델 응답은 스트리밍으로 받아 화면에 바로 흘려보내고, 결과는 data/review/report-<날짜>.json 에 남긴다.
 * 매매 실행은 없다.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildDashboard, type Dashboard } from './portfolio.ts'

const ROOT = process.cwd()
const OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions'

// .env 를 한 번 읽어 process.env 에 넣는다 (dotenv 없이)
function loadEnv() {
  const p = resolve(ROOT, '.env')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

export type Role = 'bull' | 'bear' | 'risk'
const MODELS = (): Record<Role, string> => ({
  bull: process.env.MODEL_BULL || 'openai/gpt-5.4-mini',
  bear: process.env.MODEL_BEAR || 'google/gemini-3.5-flash',
  risk: process.env.MODEL_RISK || 'anthropic/claude-sonnet-5.5',
})

const readPrompt = (role: Role) => readFileSync(resolve(ROOT, 'prompts', `advisor-${role}.md`), 'utf8')

/** 화면으로 흘려보내는 이벤트 */
export type ReviewEvent =
  | { type: 'stage'; role: Role; status: 'start' | 'done'; model: string; ms?: number }
  | { type: 'delta'; role: Role; text: string }
  | { type: 'report'; report: any }
  | { type: 'error'; message: string }

interface CallResult {
  role: Role
  model: string
  output: any
  usage: { prompt_tokens?: number; completion_tokens?: number; cost?: number } | null
  ms: number
}

/** OpenRouter 스트리밍 호출. 토큰이 올 때마다 onDelta 로 넘기고, 끝나면 전체 텍스트와 usage 를 돌려준다. */
async function callRole(role: Role, userContent: string, onDelta: (text: string) => void): Promise<CallResult> {
  const started = Date.now()
  const model = MODELS()[role]
  const res = await fetch(OPENROUTER, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:5173',
      'X-Title': 'asset-manager review board',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: readPrompt(role) },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      stream: true,
      usage: { include: true },
    }),
    signal: AbortSignal.timeout(180_000),
  })
  if (!res.ok || !res.body) throw new Error(`${role}: HTTP ${res.status} ${await res.text()}`)

  // SSE: "data: {...}\n\n" 조각을 줄 단위로 읽는다
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let text = ''
  let usage: CallResult['usage'] = null
  let seenModel = model
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') continue
      try {
        const j = JSON.parse(payload)
        const delta: string | undefined = j.choices?.[0]?.delta?.content
        if (delta) {
          text += delta
          onDelta(delta)
        }
        if (j.usage) usage = j.usage
        if (j.model) seenModel = j.model
      } catch {
        // 불완전한 조각은 무시
      }
    }
  }
  // 일부 모델은 json_object 를 요청해도 ```json 펜스로 감싸 보낸다
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  let output: any
  try {
    output = JSON.parse(stripped)
  } catch {
    output = { parse_error: true, raw: text }
  }
  return { role, model: seenModel, output, usage, ms: Date.now() - started }
}

/** 대시보드를 검토단 입력(JSON)으로 줄인다. 모델에는 이 데이터만 사실로 준다. */
function portfolioInput(dash: Dashboard) {
  const h = dash.history
  const last = h[h.length - 1]
  const back = (days: number) => {
    const target = new Date(`${last.d}T00:00:00Z`)
    target.setUTCDate(target.getUTCDate() - days)
    const t = target.toISOString().slice(0, 10)
    let base = h[0]
    for (const p of h) {
      if (p.d <= t) base = p
      else break
    }
    return base
  }
  const ret = (base: { v: number; c: number }) => (last.v - last.c - (base.v - base.c)) / base.v
  return {
    asOf: dash.asOf,
    source: '구글 시트 스냅샷 원장 + Yahoo Finance 종가 (asset-manager 대시보드)',
    totals: {
      value: dash.totals.value,
      cost: dash.totals.cost,
      gain: dash.totals.gain,
      gainRate: +dash.totals.gainRate.toFixed(4),
      dayChange: dash.totals.dayChange,
      dayRate: +dash.totals.dayRate.toFixed(4),
    },
    periodReturns: {
      week: +ret(back(7)).toFixed(4),
      month: +ret(back(30)).toFixed(4),
      quarter: +ret(back(91)).toFixed(4),
      sinceStart: +ret(h[0]).toFixed(4),
    },
    rebalanceRule: `연 1회 정기(다음 ${dash.rebalance.nextDate}) + 5/25 밴드 이탈 시 수시. 60·20%는 ±5%p, 10%는 ±2.5%p. 현재 판정: ${dash.rebalance.reason}`,
    positions: dash.positions.map((p) => ({
      name: p.name,
      code: p.code,
      quantity: p.quantity,
      avgPrice: p.avgPrice,
      price: p.price,
      value: p.value,
      gainRate: +p.gainRate.toFixed(4),
      weight: +p.weight.toFixed(3),
      target: p.target,
      band: p.band,
      outOfBand: p.outOfBand,
    })),
  }
}

/** 소집. emit 으로 진행 상황과 토큰을 흘려보내고, 마지막에 종합 보고를 돌려준다. */
export async function convene(force: boolean, emit: (e: ReviewEvent) => void) {
  loadEnv()
  if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY 가 없습니다. .env 에 넣어 주세요')
  const dash = await buildDashboard(force)
  const portfolio = portfolioInput(dash)
  const data = JSON.stringify(portfolio, null, 2)
  const brief = `다음은 ${portfolio.asOf} 기준 포트폴리오 현황이다. 이 데이터만을 사실로 삼아 역할 정의서의 출력 형식(JSON)으로 답하라.\n\n${data}`

  const run = async (role: Role, content: string) => {
    emit({ type: 'stage', role, status: 'start', model: MODELS()[role] })
    const r = await callRole(role, content, (text) => emit({ type: 'delta', role, text }))
    emit({ type: 'stage', role, status: 'done', model: r.model, ms: r.ms })
    return r
  }

  const [bull, bear] = await Promise.all([run('bull', brief), run('bear', brief)])
  const riskBrief = `${brief}\n\n[강세론 보고]\n${JSON.stringify(bull.output, null, 2)}\n\n[약세론 보고]\n${JSON.stringify(bear.output, null, 2)}`
  const risk = await run('risk', riskBrief)

  const calls = [bull, bear, risk]
  const report = {
    asOf: portfolio.asOf,
    convenedAt: new Date().toISOString(),
    models: Object.fromEntries(calls.map((c) => [c.role, c.model])),
    input: portfolio,
    bull: bull.output,
    bear: bear.output,
    risk: risk.output,
    conflicts: risk.output?.conflicts ?? [],
    questions_for_human: risk.output?.questions_for_human ?? [],
    decision: '매매 실행 없음. 최종 결정은 사람이 한다.',
    log: calls.map(({ role, model, usage, ms }) => ({
      role,
      model,
      ms,
      prompt_tokens: usage?.prompt_tokens,
      completion_tokens: usage?.completion_tokens,
      cost_usd: usage?.cost,
    })),
    totalCostUsd: calls.reduce((s, c) => s + (c.usage?.cost ?? 0), 0),
  }
  const dir = resolve(ROOT, 'data', 'review')
  mkdirSync(dir, { recursive: true })
  writeFileSync(resolve(dir, `report-${report.convenedAt.slice(0, 10)}.json`), JSON.stringify(report, null, 2))
  writeFileSync(resolve(dir, 'latest.json'), JSON.stringify(report, null, 2))
  emit({ type: 'report', report })
  return report
}

/** 마지막 소집 결과가 있으면 돌려준다 (화면을 다시 열어도 비용 없이 보여 주기 위해). */
export function latestReport(): any | null {
  const p = resolve(ROOT, 'data', 'review', 'latest.json')
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null
}
