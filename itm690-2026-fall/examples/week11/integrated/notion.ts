/**
 * 노션 발행: 일일 리포트와 검토단 보고를 "자산 현황 일지" 페이지 아래 하위 페이지로 만든다.
 * 토큰은 .env 의 NOTION_API (또는 NOTION_TOKEN), 부모 페이지는 NOTION_PARENT_PAGE_ID (없으면 기본값).
 * 통합(integration)은 그 페이지에만 연결되어 있으므로 다른 문서는 읽고 쓸 수 없다.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = process.cwd()
const API = 'https://api.notion.com/v1'
const DEFAULT_PARENT = '3c3449598c22811a9079da9db7b94482' // 📊 자산 현황 일지

function loadEnv() {
  const p = resolve(ROOT, '.env')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

export function notionConfig() {
  loadEnv()
  const token = process.env.NOTION_API || process.env.NOTION_TOKEN
  const parent = (process.env.NOTION_PARENT_PAGE_ID || DEFAULT_PARENT).replace(/-/g, '')
  return { token, parent }
}

async function call(method: string, path: string, body?: unknown) {
  const { token } = notionConfig()
  if (!token) throw new Error('NOTION_API 가 없습니다. .env 에 넣어 주세요')
  const res = await fetch(`${API}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = (await res.json()) as any
  if (!res.ok) throw new Error(`Notion ${method} ${path}: ${res.status} ${json?.message ?? ''}`)
  return json
}

/* ---------- 블록 만들기 ---------- */
const MAX_TEXT = 1900
export const rt = (text: string, ann: Record<string, boolean> = {}) => {
  const out: any[] = []
  for (let i = 0; i < Math.max(1, text.length); i += MAX_TEXT) {
    out.push({ type: 'text', text: { content: text.slice(i, i + MAX_TEXT) }, annotations: ann })
  }
  return out
}
/** "**굵게**" 표시를 굵은 리치텍스트로 바꾼다 */
export function md(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean)
  return parts.flatMap((p) => (p.startsWith('**') ? rt(p.slice(2, -2), { bold: true }) : rt(p)))
}
export const heading = (text: string, level: 1 | 2 | 3 = 2) => ({
  type: `heading_${level}`,
  [`heading_${level}`]: { rich_text: rt(text) },
})
export const paragraph = (text: string) => ({ type: 'paragraph', paragraph: { rich_text: md(text) } })
export const bullet = (text: string) => ({ type: 'bulleted_list_item', bulleted_list_item: { rich_text: md(text) } })
export const numbered = (text: string) => ({ type: 'numbered_list_item', numbered_list_item: { rich_text: md(text) } })
export const divider = () => ({ type: 'divider', divider: {} })
export const callout = (text: string, emoji = '💡') => ({
  type: 'callout',
  callout: { rich_text: md(text), icon: { type: 'emoji', emoji } },
})
export function table(rows: string[][], hasHeader = true) {
  const width = Math.max(...rows.map((r) => r.length))
  return {
    type: 'table',
    table: {
      table_width: width,
      has_column_header: hasHeader,
      has_row_header: false,
      children: rows.map((r) => ({
        type: 'table_row',
        table_row: { cells: Array.from({ length: width }, (_, i) => md(r[i] ?? '')) },
      })),
    },
  }
}
/** 마크다운 표 문자열("| a | b |" 줄들)을 행 배열로 */
export function parseMdTable(src: string): string[][] {
  return src
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|') && !/^\|\s*-{2,}/.test(l))
    .map((l) => l.slice(1, -1).split('|').map((c) => c.trim().replace(/\\~/g, '~')))
}

/* ---------- 파일 업로드 (그래프 이미지) ---------- */
export async function uploadFile(path: string, filename: string, contentType: string): Promise<string> {
  const { token } = notionConfig()
  const created = await call('POST', 'file_uploads', { filename, content_type: contentType })
  const form = new FormData()
  form.append('file', new Blob([readFileSync(path)], { type: contentType }), filename)
  const res = await fetch(created.upload_url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28' },
    body: form,
  })
  if (!res.ok) throw new Error(`Notion 파일 업로드 실패: ${res.status} ${await res.text()}`)
  return created.id as string
}
export const imageFromUpload = (id: string, caption?: string) => ({
  type: 'image',
  image: { type: 'file_upload', file_upload: { id }, caption: caption ? rt(caption) : [] },
})

/* ---------- 페이지 만들기 (블록 100개 단위로 나눠 보낸다) ---------- */
export async function createPage(title: string, emoji: string, blocks: any[], parentId?: string) {
  const parent = (parentId ?? notionConfig().parent).replace(/-/g, '')
  const first = blocks.slice(0, 100)
  const page = await call('POST', 'pages', {
    parent: { page_id: parent },
    icon: { type: 'emoji', emoji },
    properties: { title: { title: rt(title) } },
    children: first,
  })
  for (let i = 100; i < blocks.length; i += 100) {
    await call('PATCH', `blocks/${page.id}/children`, { children: blocks.slice(i, i + 100) })
  }
  return { id: page.id as string, url: page.url as string }
}

/** 부모 페이지의 하위 페이지 목록 */
export async function listChildPages(parentId?: string): Promise<{ id: string; title: string }[]> {
  const parent = (parentId ?? notionConfig().parent).replace(/-/g, '')
  const out: { id: string; title: string }[] = []
  let cursor: string | undefined
  do {
    const r = await call('GET', `blocks/${parent}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`)
    for (const b of r.results) if (b.type === 'child_page') out.push({ id: b.id, title: b.child_page.title })
    cursor = r.has_more ? r.next_cursor : undefined
  } while (cursor)
  return out
}
/** 페이지를 휴지통으로 (archived). 노션에서 복원할 수 있다. */
export const archivePage = (id: string) => call('PATCH', `pages/${id.replace(/-/g, '')}`, { archived: true })

/** 부모 페이지 안에서 "누적 기록" 표 블록을 찾는다 */
export async function findLedgerTable(parentId?: string): Promise<string | null> {
  const parent = (parentId ?? notionConfig().parent).replace(/-/g, '')
  const r = await call('GET', `blocks/${parent}/children?page_size=100`)
  let afterLedger = false
  for (const b of r.results) {
    if (b.type === 'heading_2' && b.heading_2.rich_text.map((t: any) => t.plain_text).join('').includes('누적 기록')) afterLedger = true
    if (afterLedger && b.type === 'table') return b.id
  }
  return null
}
export async function ledgerRows(tableId: string): Promise<{ id: string; cells: string[] }[]> {
  const r = await call('GET', `blocks/${tableId}/children?page_size=100`)
  return r.results.map((row: any) => ({
    id: row.id,
    cells: row.table_row.cells.map((c: any[]) => c.map((t) => t.plain_text).join('')),
  }))
}
export const appendLedgerRow = (tableId: string, cells: string[]) =>
  call('PATCH', `blocks/${tableId}/children`, {
    children: [{ type: 'table_row', table_row: { cells: cells.map((c) => md(c)) } }],
  })
export const deleteBlock = (id: string) => call('DELETE', `blocks/${id}`)

/* ---------- 일일 리포트 페이지 ---------- */
export async function publishDailyReport(report: any, svgPath?: string) {
  const m = report.markdown
  const t = report.totals
  const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`
  const signedWon = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(Math.round(n)).toLocaleString('ko-KR')}원`
  const pct = (n: number | null) => (n == null ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n * 100).toFixed(2)}%`)
  const blocks: any[] = [
    heading('오늘의 숫자'),
    table([
      ['항목', '값'],
      ['총 평가액', won(t.value)],
      ['평가손익', `${signedWon(t.gain)} (${pct(t.gainRate)})`],
      ['전일 대비', `${signedWon(t.dayChange)} (${pct(t.dayRate)})`],
      ['누적 투입액', won(t.cost)],
      ['리밸런싱', report.rebalance.needed ? '⚠️ 리밸런싱 필요' : '✅ 밴드 이내'],
    ]),
  ]
  if (svgPath && existsSync(svgPath)) {
    try {
      const id = await uploadFile(svgPath, `asset-trend-${report.date}.svg`, 'image/svg+xml')
      blocks.push(heading('자산 추이'), imageFromUpload(id))
      blocks.push(paragraph(`${report.firstDate}부터 · 파란 실선은 평가액, 주황 점선 계단은 누적 투입액입니다. 두 선 사이의 면적이 평가손익입니다.`))
    } catch (e) {
      blocks.push(paragraph(`(그래프 업로드 실패: ${e instanceof Error ? e.message : String(e)})`))
    }
  }
  blocks.push(heading('종목별 수익률'), table(parseMdTable(m.holdingsTable)))
  blocks.push(
    heading('기간 수익률'),
    paragraph('추가 투입분을 제외한 순수 수익률입니다.'),
    table([
      ['기간', '수익률'],
      ['최근 1주', pct(report.periodReturns.week)],
      ['최근 1개월', pct(report.periodReturns.month)],
      ['최근 3개월', pct(report.periodReturns.quarter)],
      [`전체 (${report.firstDate}~)`, pct(report.periodReturns.sinceStart)],
    ]),
  )
  blocks.push(heading('리밸런싱'), paragraph(m.rebalanceLine), table(parseMdTable(m.bandTable)))
  blocks.push(paragraph('밴드는 5/25 규칙(절대 5%p와 목표의 상대 25% 중 작은 쪽). 60·20%는 ±5%p, 10%는 ±2.5%p가 허용 범위입니다.'))
  blocks.push(divider(), paragraph(`장부: 구글 시트 스냅샷 ${report.snapshotCount}건 · 시세: Yahoo Finance ${report.date} 종가 기준`))
  const page = await createPage(m.title, '📈', blocks)

  // 부모 페이지의 누적 기록 표에 한 줄 추가 (같은 날짜가 있으면 건너뜀)
  const ledger = await findLedgerTable()
  if (ledger) {
    const rows = await ledgerRows(ledger)
    if (!rows.some((r) => r.cells[0] === report.date)) {
      await appendLedgerRow(ledger, [
        report.date, won(t.value), signedWon(t.gain), pct(t.dayRate), pct(t.gainRate), won(t.cost),
        report.rebalance.needed ? '리밸런싱 필요' : '밴드 이내',
      ])
    }
  }
  return page
}

/* ---------- 검토단 보고 페이지 ---------- */
const s = (v: unknown) => (v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v))
export async function publishReview(report: any) {
  const blocks: any[] = [
    callout(`데이터 ${report.asOf} 기준 · 소집 ${report.convenedAt.replace('T', ' ').slice(0, 16)} UTC · 총 비용 $${(report.totalCostUsd ?? 0).toFixed(4)} · ${report.decision}`, '🏛️'),
    heading(`1. 강세론 (${report.models.bull})`),
    table([['자산', '강세 근거', '매력도'], ...(report.bull?.table ?? []).map((r: any) => [s(r.asset), s(r.reason), s(r.attractiveness)])]),
    paragraph(`**제안** ${s(report.bull?.proposal)}`),
    heading(`2. 약세론 (${report.models.bear})`),
    table([['자산', '위험 요인', '경계'], ...(report.bear?.table ?? []).map((r: any) => [s(r.asset), s(r.risk), s(r.alert)])]),
    paragraph(`**제안** ${s(report.bear?.proposal)}`),
    heading(`3. 리스크·검증 (${report.models.risk})`),
    paragraph(`**반론 · 강세** ${s(report.risk?.rebuttals?.bull)}`),
    paragraph(`**반론 · 약세** ${s(report.risk?.rebuttals?.bear)}`),
  ]
  const claims: any[] = report.risk?.unverifiable_claims ?? []
  if (claims.length) {
    blocks.push(heading('데이터로 확인되지 않은 주장', 3), ...claims.map((c) => bullet(s(c))))
  }
  blocks.push(
    table([
      ['안', '매매', '밴드 내', '비용 메모'],
      ...(report.risk?.proposals ?? []).map((r: any) => [s(r.name), s(r.trades), r.within_band === true ? '예' : r.within_band === false ? '아니오' : s(r.within_band), s(r.cost_note)]),
    ]),
    heading('4. 종합: 의견이 갈린 지점과 남은 질문'),
    heading('충돌 지점', 3),
    ...(report.conflicts ?? []).map((c: unknown) => bullet(s(c))),
    heading('사람에게 남기는 질문', 3),
    ...(report.questions_for_human ?? []).map((q: unknown) => numbered(s(q))),
    heading('5. 실행 기록'),
    table([
      ['역할', '모델', '시간', '입력 토큰', '출력 토큰', '비용(USD)'],
      ...(report.log ?? []).map((l: any) => [l.role, l.model, `${(l.ms / 1000).toFixed(1)}초`, s(l.prompt_tokens), s(l.completion_tokens), l.cost_usd != null ? l.cost_usd.toFixed(4) : '']),
    ]),
    divider(),
    paragraph('이 보고의 수치와 전망은 교육용 시뮬레이션의 산출물이며 투자 자문이 아닙니다. 매매 실행은 없으며 최종 결정은 사람이 합니다.'),
  )
  return createPage(`검토단 보고 ${report.asOf}`, '🏛️', blocks)
}
