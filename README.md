# 📘 나이스 가이드 - NEIS 업무 AI 도우미

Supabase Edge Functions + Gemini API + React로 구성된 나이스(NEIS) 업무 안내 챗봇입니다.

## 아키텍처 (RAG 버전)

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────┐
│  React 프론트엔드  │────▶│ Supabase Edge Function │────▶│  Gemini API  │
│  (Vercel/Netlify) │◀────│   (RAG + Deno 런타임)   │◀────│             │
└─────────────────┘     └──────────┬───────────┘     └─────────────┘
                                   │
                                   ▼
                           ┌─────────────────┐
                           │ Supabase Postgres│
                           │ manual_chunks    │
                           └─────────────────┘
```

- **프론트엔드**: React + Vite → Vercel 또는 Netlify
- **백엔드**: Supabase Edge Function → (DB 검색) → Gemini REST API
- **데이터**: PDF에서 추출한 텍스트를 Supabase DB에 저장(페이지 포함) → 질문마다 Top-K 발췌만 프롬프트에 삽입

> ✅ 이 방식은 Gemini File API(48시간 만료) 의존도가 없어 프로덕션 운영이 더 안정적입니다.

---

## 셋업 가이드 (RAG 최소 구현)

### 1단계: 사전 준비

```bash
# Gemini API 키 발급
# https://aistudio.google.com/apikey

# Supabase CLI 설치
npm install -g supabase
```

### 2단계: 프로젝트 클론 & 의존성 설치

```bash
cd neis-guide
npm install
```

### 3단계: DB 스키마 적용 (manual_chunks + 검색 RPC)

아래 migration을 적용합니다.

- 파일: `supabase/migrations/20260303_manual_rag.sql`

```bash
supabase login
supabase link --project-ref your-project-ref
supabase db push
```

(또는 Supabase Dashboard → SQL Editor에서 migration 내용을 실행해도 됩니다.)

### 4단계: 텍스트(페이지 포함) 업로드

PDF에서 추출한 텍스트 파일(페이지 마커 포함)을 DB에 넣습니다.

```bash
npm i @supabase/supabase-js
SUPABASE_URL="https://xxxx.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key" \
node ingest-manual-text.mjs ./path/to/교무업무_매뉴얼_텍스트추출.txt 교무업무_매뉴얼
```

- 두 번째 매뉴얼도 같은 방식으로 추가 가능:
  - `node ingest-manual-text.mjs ./학교관리자_매뉴얼_텍스트추출.txt 학교관리자_매뉴얼`

### 5단계: Supabase Edge Function 배포

```bash
supabase secrets set GEMINI_API_KEY="your-gemini-api-key"
supabase secrets set GEMINI_MODEL="gemini-2.5-flash"

# RAG 조회용 (서버 내부에서만 사용)
supabase secrets set SUPABASE_URL="https://xxxx.supabase.co"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

supabase functions deploy chat
```

### 6단계: 프론트엔드 환경변수 설정 & 실행

```bash
cp .env.example .env.local
# .env.local:
# VITE_SUPABASE_FUNCTION_URL=https://your-project.supabase.co/functions/v1

npm run dev
```

---

## 로컬 개발 (Supabase 로컬)

```bash
supabase start
supabase functions serve chat --env-file ./supabase/.env.local
npm run dev
```

---

## 파일/폴더

```
neis-guide/
├── supabase/
│   ├── migrations/
│   │   └── 20260303_manual_rag.sql
│   └── functions/
│       ├── _shared/cors.ts
│       └── chat/index.ts
├── ingest-manual-text.mjs
└── README.md
```

---

## (참고) 모델 선택

- 기본 추천: `gemini-2.5-flash` (품질/비용/속도 밸런스)
- 비용 최우선: `gemini-2.5-flash-lite`
- 더 강한 추론이 필요할 때만: `gemini-3.1-pro-preview` (비용↑, preview)

