// 로컬 실행: node run-local.mjs  (환경변수 OPENROUTER_API_KEY 필요, .env 파일이 있으면 읽는다)
// 결과는 output/report-<날짜>.json 에 저장한다.
import fs from "node:fs";
import path from "node:path";
import { convene } from "./api/review.js";

// 아주 작은 .env 로더 (dotenv 패키지 없이)
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
if (!process.env.OPENROUTER_API_KEY) { console.error("OPENROUTER_API_KEY가 없다. .env 에 넣는다."); process.exit(1); }

const portfolio = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "portfolio-sample.json"), "utf8"));
console.log("검토단 소집:", portfolio.asOf);
const report = await convene(portfolio);
fs.mkdirSync("output", { recursive: true });
const out = path.join("output", `report-${report.convenedAt.slice(0, 10)}.json`);
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log("저장:", out);
console.table(report.log);
console.log("총 비용(USD):", report.totalCostUsd);
console.log("충돌 지점:", report.conflicts);
console.log("사람에게 남기는 질문:", report.questions_for_human);
