// 로컬 웹앱 실행: node server.mjs  →  http://localhost:3000
// Vercel 없이 public/index.html 을 서비스하고 POST /api/review 를 api/review.js 핸들러로 넘긴다.
// 환경변수 OPENROUTER_API_KEY 는 .env 에서 읽는다.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import handler from "./api/review.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url)); // 어느 폴더에서 실행해도 예제 폴더 기준
const PORT = Number(process.env.PORT || 3000);

// 아주 작은 .env 로더 (dotenv 패키지 없이)
const envPath = path.join(ROOT, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };

// Vercel 핸들러가 기대하는 req.body / res.status().json() 을 흉내 낸다
function wrap(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { res.setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(obj)); return res; };
  return res;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === "/api/review") {
    let raw = ""; for await (const chunk of req) raw += chunk;
    try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; }
    req.query = Object.fromEntries(url.searchParams);
    const started = Date.now();
    await handler(req, wrap(res));
    console.log(`${req.method} /api/review → ${res.statusCode} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    return;
  }
  // 정적 파일: public/ 아래만
  const file = path.join(ROOT, "public", url.pathname === "/" ? "index.html" : url.pathname);
  if (!file.startsWith(path.join(ROOT, "public")) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.statusCode = 404; return res.end("not found");
  }
  res.setHeader("Content-Type", MIME[path.extname(file)] || "application/octet-stream");
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => {
  console.log(`검토단 웹앱: http://localhost:${PORT}  (키 ${process.env.OPENROUTER_API_KEY ? "있음" : "없음: .env 에 OPENROUTER_API_KEY 를 넣는다"})`);
});
