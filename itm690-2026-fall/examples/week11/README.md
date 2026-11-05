# 검토단 소집 예제 (11강 §6)

과제 2 웹앱에 붙일 수 있는 "검토단 소집" 기능의 최소 예제. 서버리스 함수 하나가 OpenRouter를 역할별로 세 번 호출한다.

```
prompts/advisor-bull.md   강세론 담당 역할 정의서 (시스템 프롬프트)
prompts/advisor-bear.md   약세론 담당
prompts/advisor-risk.md   리스크·검증 담당 (두 의견을 입력으로 받는다)
data/portfolio-sample.json  입력 데이터 예시 (부트캠프 4주차 asset-manager의 2026-08-25 실제 출력)
api/review.js             Vercel 서버리스 함수. POST /api/review
public/index.html         버튼 하나짜리 화면
run-local.mjs             배포 없이 로컬에서 1회 소집해 output/ 에 저장
```

## 실행

1. `.env` 파일에 `OPENROUTER_API_KEY=sk-or-...` 한 줄을 둔다. `.gitignore`에 `.env`와 `output/`이 들어 있다.
2. 로컬 1회 실행: `node run-local.mjs` (Node 18 이상). 결과는 `output/report-YYYY-MM-DD.json`.
3. Vercel 배포: 프로젝트 루트에서 `vercel` 또는 깃헙 연동. 환경변수 `OPENROUTER_API_KEY`를 Vercel 대시보드에 넣는다.

## 구조

```
브라우저 → POST /api/review
          → OpenRouter (의견 A: bull, 모델 1) ┐ 병렬
          → OpenRouter (의견 B: bear, 모델 2) ┘
          → OpenRouter (검증: risk, 모델 3, 입력 = 데이터 + 의견 A + 의견 B)
          → 코드가 종합(모델 호출 없음) → JSON 응답 (보고 + 실행 기록)
```

- 역할마다 다른 제공자의 모델을 쓴다. 환경변수 `MODEL_BULL`, `MODEL_BEAR`, `MODEL_RISK`로 바꿀 수 있다. 모델 ID는 https://openrouter.ai/models 에서 확인한다.
- 출력은 `response_format: json_object`로 구조화한다. 화면과 로그가 필드를 그대로 읽는다.
- 검증 역할은 입력 데이터에 없는 수치를 계산하지 않고 "입력 없음"으로 표시한다. 백테스트·몬테카를로 같은 도구 검증은 서버가 계산해 입력으로 넘기는 것이 다음 단계다(§8 (e) 도구·실행 기반 검증).

## 안전장치 (부트캠프 ⑤·⑦)

읽기 전용 데이터 · 실행 권한 없음(증권사 연결 없음) · 결정은 사람 · 입력 데이터 속 지시문은 따르지 않음(역할 정의서의 금지 항목) · 실행 기록(모델·토큰·비용) 보존.

## 다음 단계 (실습 3단계)

- `report.log`를 Supabase 테이블에 저장(7강 §7의 로그 구조 확장: 소집 시각, 역할별 모델, 토큰, 비용, 결과 요약).
- 종합 보고를 노션 페이지로 발행(§4).
- Vercel Cron으로 매일 아침 소집. 일일 호출 수 상한과 실패 알림을 함께 둔다.

이 예제의 숫자와 전망은 교육용 시뮬레이션의 산출물이며 투자 자문이 아니다.
