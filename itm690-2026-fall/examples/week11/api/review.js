// /api/review : 검토단 소집 (Vercel 서버리스 함수, Node 18+)
// 흐름: 입력 데이터 → [의견 A, 의견 B 병렬 호출] → 검증 역할(두 의견 입력) → 종합 → JSON 응답
// 키는 환경변수 OPENROUTER_API_KEY 에만 둔다. 코드와 저장소에 키를 쓰지 않는다.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";

// 역할마다 다른 제공자의 모델을 쓴다(모델 다양성). 환경변수로 바꿀 수 있다.
const MODELS = {
  bull: process.env.MODEL_BULL || "openai/gpt-5.4-mini",
  bear: process.env.MODEL_BEAR || "google/gemini-3.5-flash",
  risk: process.env.MODEL_RISK || "anthropic/claude-sonnet-5.5",
};

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), ".."); // 예제 폴더(prompts/, data/ 의 부모)
const readPrompt = (name) => fs.readFileSync(path.join(ROOT, "prompts", `${name}.md`), "utf8");

async function callRole(role, userContent, { timeoutMs = 90_000 } = {}) {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(OPENROUTER, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
        "X-Title": "ITM690 week11 review board",
      },
      body: JSON.stringify({
        model: MODELS[role],
        messages: [
          { role: "system", content: readPrompt(`advisor-${role}`) },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        usage: { include: true },
      }),
    });
    if (!res.ok) throw new Error(`${role}: HTTP ${res.status} ${await res.text()}`);
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    // 일부 모델은 json_object를 요청해도 ```json ... ``` 펜스로 감싸 보낸다. 펜스를 벗기고 파싱한다.
    const stripped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    let parsed;
    try { parsed = JSON.parse(stripped); } catch { parsed = { parse_error: true, raw: text }; }
    return {
      role, model: data.model || MODELS[role], output: parsed,
      usage: data.usage || null, // prompt_tokens, completion_tokens, cost(USD)
      ms: Date.now() - started,
    };
  } finally { clearTimeout(timer); }
}

export async function convene(portfolio) {
  const data = JSON.stringify(portfolio, null, 2);
  const brief = `다음은 ${portfolio.asOf} 기준 포트폴리오 현황이다. 이 데이터만을 사실로 삼아 역할 정의서의 출력 형식(JSON)으로 답하라.\n\n${data}`;

  // 1) 의견 A·B는 서로 독립이므로 병렬 호출
  const [bull, bear] = await Promise.all([callRole("bull", brief), callRole("bear", brief)]);

  // 2) 검증 역할은 두 의견을 입력으로 받는다
  const riskBrief = `${brief}\n\n[강세론 보고]\n${JSON.stringify(bull.output, null, 2)}\n\n[약세론 보고]\n${JSON.stringify(bear.output, null, 2)}`;
  const risk = await callRole("risk", riskBrief);

  // 3) 종합: 모델을 다시 부르지 않고 코드가 묶는다(비용 0, 구조 고정)
  const calls = [bull, bear, risk];
  const totalCost = calls.reduce((s, c) => s + (c.usage?.cost || 0), 0);
  return {
    asOf: portfolio.asOf,
    convenedAt: new Date().toISOString(),
    models: Object.fromEntries(calls.map((c) => [c.role, c.model])),
    bull: bull.output, bear: bear.output, risk: risk.output,
    conflicts: risk.output?.conflicts || [],
    questions_for_human: risk.output?.questions_for_human || [],
    decision: "매매 실행 없음. 최종 결정은 사람이 한다.",
    log: calls.map(({ role, model, usage, ms }) => ({ role, model, ms, prompt_tokens: usage?.prompt_tokens, completion_tokens: usage?.completion_tokens, cost_usd: usage?.cost })),
    totalCostUsd: totalCost,
  };
}

// Vercel 핸들러: POST /api/review  (본문에 포트폴리오 JSON을 주거나, 없으면 샘플 데이터)
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!process.env.OPENROUTER_API_KEY) return res.status(500).json({ error: "OPENROUTER_API_KEY missing" });
  try {
    const portfolio = req.body && req.body.positions ? req.body
      : JSON.parse(fs.readFileSync(path.join(ROOT, "data", "portfolio-sample.json"), "utf8"));
    const report = await convene(portfolio);
    // TODO(실습 3단계): Supabase에 report.log 저장, 노션 페이지로 발행
    return res.status(200).json(report);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
