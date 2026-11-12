/**
 * 노션 발행 스크립트 (개발서버 없이 단독 실행, node --experimental-strip-types)
 *
 *   npm run notion -- 2026-11-12            data/report/2026-11-12.json 을 "자산 현황 일지" 아래 페이지로 발행
 *   npm run notion -- --review              data/review/latest.json 을 "검토단 보고 <날짜>" 페이지로 발행
 *   npm run notion -- --list                부모 페이지 아래 하위 페이지 목록
 *   npm run notion -- --archive 2026-08     제목에 그 문자열이 든 하위 페이지를 휴지통으로 (누적 기록 표의 같은 달 행도 삭제)
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  archivePage, deleteBlock, findLedgerTable, ledgerRows, listChildPages, publishDailyReport, publishReview,
} from '../server/notion.ts'

const arg = process.argv[2]
const REPORT_DIR = resolve(process.cwd(), 'data', 'report')

async function main() {
  if (!arg) throw new Error('날짜(YYYY-MM-DD) 또는 --review / --list / --archive <문자열> 을 주세요')
  if (arg === '--list') {
    for (const p of await listChildPages()) console.log(p.id, p.title)
    return
  }
  if (arg === '--archive') {
    const key = process.argv[3]
    if (!key) throw new Error('--archive 뒤에 제목에 포함된 문자열(예: 2026-08)을 주세요')
    const pages = (await listChildPages()).filter((p) => p.title.includes(key))
    for (const p of pages) {
      await archivePage(p.id)
      console.log('휴지통으로:', p.title)
    }
    const ledger = await findLedgerTable()
    if (ledger) {
      for (const r of await ledgerRows(ledger)) {
        if (r.cells[0]?.includes(key)) {
          await deleteBlock(r.id)
          console.log('누적 기록 행 삭제:', r.cells[0])
        }
      }
    }
    return
  }
  if (arg === '--review') {
    const p = resolve(process.cwd(), 'data', 'review', 'latest.json')
    if (!existsSync(p)) throw new Error('data/review/latest.json 이 없습니다. 검토 탭에서 먼저 소집하세요')
    const page = await publishReview(JSON.parse(readFileSync(p, 'utf8')))
    console.log('발행:', page.url)
    return
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(arg)) throw new Error(`날짜 형식이 아닙니다: ${arg}`)
  const json = resolve(REPORT_DIR, `${arg}.json`)
  if (!existsSync(json)) throw new Error(`${json} 이 없습니다. 먼저 npm run report -- ${arg}`)
  const page = await publishDailyReport(JSON.parse(readFileSync(json, 'utf8')), resolve(REPORT_DIR, `asset-trend-${arg}.svg`))
  console.log('발행:', page.url)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
