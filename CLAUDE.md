# ai-law-lectures

김병필 (KAIST 기술경영전문대학원) 인공지능과 법 관련 강의 자료 사이트.
GitHub Pages로 서비스된다: https://byoungpil-kim.github.io/ai-law-lectures/

## 구조

- `index.html` — 루트 강의 목록 페이지. 각 학기 강의로 가는 링크만 둔다.
- `<course>-<year>-<term>/` — 학기별 강의 폴더 (예: `itm690-2026-fall/`).
  - `index.html` — 강의 일정 페이지
  - `weekNN.html` — 주차별 강의자료 (두 자리, `week01.html` ~ `week16.html`)
  - `pdf/weekNN.pdf` — 주차별 PDF
  - 일정 페이지는 `weekNN.html` / `pdf/weekNN.pdf` 존재 여부를 HEAD 요청으로 확인해
    없으면 버튼을 "준비 중"으로 바꾼다. 파일 이름 규칙을 지켜야 자동으로 연결된다.
- 새 학기를 추가할 때는 폴더를 만들고 루트 `index.html` 목록에 링크를 추가한다.

## 디자인 체계

전반적인 design scheme은 **https://miraeitm.github.io/** 를 따른다
(Cool-tone Blue Minimalist). 새 페이지를 만들거나 기존 페이지를 수정할 때
아래 토큰과 규칙을 그대로 사용한다. 외부 CSS 프레임워크는 쓰지 않고,
페이지마다 `<style>`에 자체 포함(self-contained)한다.

### 색상 토큰

```css
:root{
  --primary:#1E40AF; --secondary:#3B82F6; --accent:#60A5FA;
  --bg:#F8FAFC; --bg-elev:#FFFFFF; --bg-soft:#EFF4FB;
  --text-primary:#0F172A; --text-secondary:#475569; --border:#E2E8F0;
  --shadow-sm:0 1px 2px rgba(15,23,42,.04); --shadow-md:0 4px 12px rgba(15,23,42,.06);
  --radius-sm:6px; --radius-md:10px; --radius-lg:16px;
}
```

강의 일정 회차 구분 색: 이론·기술 `#1E40AF`, 이론·법 `#0F766E`,
실습 `#B45309`, 수강생 발표 `#7C3AED`, 휴강은 점선 회색 `#CBD5E1`.

### 타이포그래피

- 폰트: Google Fonts `Inter` + `Noto Sans KR` (400/500/600/700), 시스템 폰트 fallback.
- 본문 16px, line-height 1.6, `word-break:keep-all`, antialiased.
- 제목은 `letter-spacing:-.02em`, 굵기 700. 섹션 라벨은 `.section-label`
  (0.75rem, 600, letter-spacing .12em, uppercase, `--secondary` 색).

### 레이아웃·컴포넌트

- 본문 최대 폭 1120px (단순 목록 페이지는 720px), 좌우 여백 24px.
- 상단 바 `.topbar`: sticky, 높이 64px, 반투명 배경 + backdrop blur, 하단 1px 보더.
  왼쪽에 원형 브랜드 마크(`--primary` 배경, 흰 글자) + 브랜드 텍스트, 학기 태그(pill).
- 카드: 흰 배경, 1px `--border`, `--radius-lg`, `--shadow-sm`.
  hover 시 `translateY(-2px)`, `--shadow-md`, 보더 `--accent`.
- 버튼: `--radius-md`, 1px 보더. 기본은 흰 배경 + `--primary` 글자,
  강조(PDF 등)는 `--primary` 배경 + 흰 글자. 비활성은 점선 보더 + `--text-secondary`.
- 링크 색 `--primary`, hover `--secondary`. 포커스는 2px `--secondary` 아웃라인.
- 모션은 `.15s`~`.18s ease`, `prefers-reduced-motion`이면 끈다.
- 640px 이하에서 그리드를 세로로 접는다.

### 문체

- 페이지 언어는 한국어(`lang="ko"`), 영문 부제는 보조로만.
- 푸터: `© 2026 김병필 · KAIST 기술경영전문대학원`.
