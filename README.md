# LegalSetu

**AI-Powered Multilingual Legal Assistance Platform for India**

LegalSetu is a research-grade, production-oriented platform that helps Indian
citizens understand legal information, legal documents, and the FIR process —
in their own language, grounded strictly in verified legal sources.

LegalSetu is **not a lawyer** and does not provide legal advice. It is a legal
**information** and **document-understanding** assistant, with clear
disclaimers and escalation paths to human legal aid built in throughout.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Features](#features)
3. [Tech Stack](#tech-stack)
4. [Folder Structure](#folder-structure)
5. [Environment Variables](#environment-variables)
6. [Installation](#installation)
7. [Database & pgvector Setup](#database--pgvector-setup)
8. [Running Locally](#running-locally)
9. [Demo Mode](#demo-mode)
10. [RAG Ingestion](#rag-ingestion)
11. [AI Provider Setup](#ai-provider-setup)
12. [Testing](#testing)
13. [Docker](#docker)
14. [Security](#security)
15. [Performance](#performance)
16. [Research / Evaluation](#research--evaluation)
17. [Limitations](#limitations)
18. [Future Improvements](#future-improvements)

---

## Architecture

```
User → Next.js App Router UI → API Routes → RAG Retriever → pgvector (LegalSourceChunk)
                                       ↓
                              AI Provider Abstraction (mock | OpenAI | ...)
                                       ↓
                           Grounded, cited response with evidence level
```

Core design principles:

- **Provider-agnostic AI layer** (`lib/ai/`) — no code outside `lib/ai/`
  ever imports a vendor SDK directly.
- **Grounded-only legal answers** — the system prompt (`lib/rag/prompt.ts`)
  forbids fabricated citations and explicitly separates SYSTEM INSTRUCTIONS,
  USER INPUT, and RETRIEVED LEGAL DATA to defend against prompt injection
  from poisoned documents.
- **Demo Mode by default** — the entire app runs end-to-end with zero API
  keys via a deterministic mock AI provider, clearly labeled everywhere.
- **User data isolation** — every data-access query filters by the
  authenticated user's ID at the Prisma layer, not just at the UI layer.

## Features

- Multilingual UI (15 Indian languages + English), with **interface**,
  **response**, and **voice** language selected independently.
- Voice input (mic → transcription → editable text → submit).
- Streaming, source-grounded legal chat with evidence-level indicators.
- Legal document upload, OCR, and plain-language explanation.
- Guided, step-by-step FIR drafting assistant with validation and a
  completeness score — always labeled "Draft / Assistance Document."
- Legal-source ingestion & verification pipeline for administrators.
- Lawyer/legal-aid escalation module (no fabricated lawyer data).
- Admin panel with a clearly-labeled demo evaluation dashboard.
- Security-first defaults: rate limiting, input validation, file-type
  validation, security headers, audit logging, RBAC.

## Tech Stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS · Prisma · PostgreSQL +
pgvector · Auth.js (NextAuth v5, Credentials) · Zod · OpenAI SDK (swappable) ·
Vitest · Playwright · Docker.

## Folder Structure

```
legalsetu/
├── app/                # App Router: pages + API routes
│   ├── (auth)/         # login, register, forgot-password
│   ├── dashboard/      # chat, cases, documents, fir, sources, settings, admin
│   └── api/            # route handlers (chat, rag, documents, fir, voice, ...)
├── components/         # ui/, dashboard/, chat/, fir/, voice/, common/
├── lib/                # ai/, rag/, auth/, db/, security/, validation/,
│                        storage/, translation/, ocr/, voice/, logging/, utils/
├── prisma/             # schema.prisma, seed.ts
├── scripts/             # rag ingestion + embedding CLI scripts
├── tests/               # unit/, integration/, e2e/
├── types/, hooks/, config/
```

## Environment Variables

Copy `.env.example` to `.env` and fill in real values. **Never commit `.env`.**
See that file for the full list (database, auth secret, AI provider keys,
Redis, storage). The app is designed to run with **only** `DATABASE_URL` and
`AUTH_SECRET` set — everything AI-related defaults to demo mode.

## Installation

```bash
npm install
cp .env.example .env
# edit .env — at minimum set DATABASE_URL and AUTH_SECRET
```

## Database & pgvector Setup

LegalSetu requires PostgreSQL with the `pgvector` extension.

**Option A — Docker (recommended):**
```bash
docker compose up -d db redis
```

**Option B — existing Postgres instance:**
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Then run migrations and seed demo data:
```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

Demo login after seeding: `demo@legalsetu.example` / `Demo@12345`
Admin login: `admin@legalsetu.example` / `Demo@12345`

## Running Locally

```bash
npm run dev
```
Visit `http://localhost:3000`.

## Demo Mode

Set `AI_PROVIDER=mock` (the default in `.env.example`) to run the **entire**
app — chat, RAG, voice, OCR, translation — without any API keys. All demo
output is explicitly labeled `[DEMO MODE]` / "DEMO DATA" in the UI and never
presented as real legal information.

## RAG Ingestion

Add a verified legal source:
```bash
npm run rag:ingest -- --file=./my-act.txt --title="Example Act" --jurisdiction="Maharashtra"
npm run rag:embed
```
Newly ingested sources default to `PENDING_REVIEW` and must be explicitly
marked `VERIFIED` (via the admin panel / DB) before they are used in
retrieval — the retriever only queries `VERIFIED` sources.

## AI Provider Setup

**Default real provider: Google Gemini.** Set in `.env`:
```
AI_PROVIDER=gemini
GEMINI_API_KEY=AIza...
```

**Alternate provider: OpenAI** (still supported, e.g. if you have OpenAI
credits available):
```
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

To add a new provider (e.g. a dedicated Indic ASR/translation service),
implement the `AIProvider` interface in `lib/ai/provider.ts` in a new file
(e.g. `lib/ai/bhashini.ts`) and register it in `getAIProvider()`. Nothing
else in the app needs to change.

## Testing

```bash
npm run test          # unit + integration (Vitest)
npm run test:e2e       # end-to-end (Playwright, requires dev server)
npm run typecheck
npm run lint
```

## Docker

```bash
docker compose up --build
```
Runs Postgres (pgvector), Redis, and the app together.

## Security

RBAC · Zod validation on every input · rate limiting per endpoint category ·
strict file upload validation (MIME + extension + size + filename
sanitization) · security headers (CSP, X-Frame-Options, HSTS in production,
Permissions-Policy) · HttpOnly/SameSite session cookies via NextAuth ·
Prisma parameterized queries (SQL-injection safe) · prompt-injection defense
in the RAG prompt · audit logging with secret redaction · per-user data
isolation enforced at the query layer.

## Performance

Server Components by default · streaming AI responses (SSE) · DB indexes on
all foreign keys and frequently filtered columns · pagination-ready API
shapes · dynamic imports for heavy client components (mic recorder) ·
`next/font`, `next/image` used throughout · standalone Docker build output
for minimal image size.

## Research / Evaluation

`/dashboard/admin/evaluation` exposes an evaluation architecture (retrieval
precision/recall, citation accuracy, groundedness, hallucination rate,
translation quality, FIR completeness, latency, user satisfaction) — **all
values shown are clearly labeled DEMO DATA**. Wire real computation against
your test set before citing any numbers externally.

## Limitations

- STT/OCR/translation adapters beyond OpenAI are stubbed as interfaces, not
  implemented — see `lib/ai/provider.ts` to add a dedicated Indic-language
  provider (e.g. Bhashini) for Bhojpuri/Maithili quality.
- The in-memory rate limiter is per-instance; use Redis in multi-instance
  production deployments.
- pgvector SQL search requires a live Postgres instance with the extension
  enabled; a JS in-memory cosine-similarity fallback is used otherwise.
- Password-reset email delivery is not wired to a mail provider.
- The lawyer/legal-aid directory is intentionally empty until connected to a
  real, verified data source — no lawyers are fabricated.

## Future Improvements

Dedicated low-resource-language ASR/translation integration · S3-compatible
storage adapter · background job queue for document ingestion at scale ·
real evaluation harness with a held-out legal QA test set · mobile app.

---

*LegalSetu provides legal information, not legal advice. For complex or
high-risk matters, please consult a qualified lawyer or an official
legal-aid service.*
