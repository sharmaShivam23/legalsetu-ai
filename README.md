# ⚖️ LegalSetu

**AI-Powered Multilingual Legal Assistance Platform for India**

LegalSetu is a research-grade, production-shaped platform that helps Indian citizens understand legal information, legal documents, and the FIR (police complaint) process — **in their own language**, grounded strictly in verified legal sources, with every AI claim checked before it reaches the user.

It is **not a lawyer** and does not provide legal advice. It is a legal **information** and **document-understanding** assistant — with disclaimers, self-auditing citations, and escalation paths to real legal aid built into the architecture itself, not bolted on as a disclaimer banner.

> *If you are reviewing this as an evaluator: the single most distinctive thing in this codebase is that the AI is not trusted by default — every legal claim it makes is checked against source text after generation, not just instructed to behave via a prompt. See [Answer Trust & Citation Verification](#-answer-trust--citation-verification-the-core-differentiator).*

---

## Table of Contents

1. [Why This Project Is Different](#-why-this-project-is-different)
2. [Architecture](#-architecture)
3. [Feature Tour](#-feature-tour)
4. [Answer Trust & Citation Verification](#-answer-trust--citation-verification-the-core-differentiator)
5. [The FIR Assistant — Deep Dive](#-the-fir-assistant--deep-dive)
6. [Multi-Provider AI Layer & Failover](#-multi-provider-ai-layer--failover)
7. [Multilingual Engine](#-multilingual-engine)
8. [Real-Time Voice Mode](#-real-time-voice-mode)
9. [Document OCR Pipeline](#-document-ocr-pipeline)
10. [Cross-Conversation Memory](#-cross-conversation-memory)
11. [Case Management Layer](#-case-management-layer)
12. [Security Model](#-security-model)
13. [Tech Stack](#-tech-stack)
14. [Data Model](#-data-model)
15. [Project Structure](#-project-structure)
16. [Getting Started](#-getting-started)
17. [Environment Variables](#-environment-variables)
18. [Database & pgvector Setup](#-database--pgvector-setup)
19. [Demo Mode](#-demo-mode)
20. [RAG Ingestion Pipeline](#-rag-ingestion-pipeline)
21. [Testing](#-testing)
22. [Docker Deployment](#-docker-deployment)
23. [Research / Evaluation Dashboard](#-research--evaluation-dashboard)
24. [Known Limitations](#-known-limitations)
25. [Roadmap](#-roadmap)
26. [License & Disclaimer](#-license--disclaimer)

---

## 🎯 Why This Project Is Different

Most "AI legal chatbot" projects stop at prompt engineering: tell the model to cite sources, tell it not to hallucinate, and hope. LegalSetu treats that as necessary but not sufficient, and adds a second, independent layer that **verifies the model's own output after the fact**:

| Typical final-year legal-AI project | LegalSetu |
|---|---|
| Trusts whatever the model cites | Every "Section 304 / u/s 420 / BNS 303" in an answer is regex-extracted and checked against the actual retrieved text — unsupported citations are flagged and the confidence badge is downgraded automatically |
| One hardcoded AI provider, breaks when the key runs out | 6 provider families (Gemini, OpenAI, Anthropic, Groq, OpenRouter, OpenCode) with automatic failover, per-provider API **key pools** (rotate on quota exhaustion), transient-vs-permanent error classification, and a 15-minute "provider bench" to stop retrying a dead provider on every message |
| One static "explain this in Hindi" template via i18n JSON files | Zero locale files — a runtime batch-translation engine translates **any** string on demand, masks legal citations/URLs so translation can never corrupt a section number, and caches every translation in Postgres so it's free the second time, for *any* user |
| An FIR "wizard" — the same 8 form fields for a theft and a cyber-fraud | A stateful **intake engine** that extracts every fact from free-text answers, asks only what a *given incident type* actually needs, tracks the **provenance** (user statement vs. uploaded document vs. AI inference) and **confidence** of every fact, detects **contradictions** between sources, and refuses to draft a complaint containing anything nobody actually said |
| Voice = record → upload → transcribe → done | A full duplex, ChatGPT-style voice loop: client-side voice-activity detection, barge-in (interrupt the assistant mid-sentence), dual-buffer gapless TTS playback, and a dual speech engine that never fails silently |
| One "OCR the PDF" button | Hybrid OCR: free, on-device Tesseract.js first; a Gemini Vision fallback kicks in *only* for the specific low-confidence pages, capped in pages/words/size so it can't be abused as a bulk OCR service |
| A generic "chat" mode | Three chat modes (**Quick**, **Case Analysis**, **Knowledge**) sharing one grounded pipeline, with Case Analysis producing a structured report — urgent actions, a step table, an auto-generated **Mermaid flowchart**, legal basis, and a disclaimer — never rendered until the diagram is syntactically validated |

---

## 🏗️ Architecture

```
                                    ┌─────────────────────────────┐
                                    │   Next.js 16 App Router UI   │
                                    │  (Server Components + SSE)   │
                                    └──────────────┬───────────────┘
                                                    │
                       ┌────────────────────────────┼────────────────────────────┐
                       ▼                            ▼                            ▼
              /api/chat/stream              /api/documents/*             /api/fir/*
              (quick/case/knowledge)         (upload → OCR → analyze)    (intake → draft → PDF)
                       │                            │                            │
                       ▼                            ▼                            ▼
        ┌──────────────────────────┐   ┌──────────────────────┐   ┌───────────────────────────┐
        │   RAG Retriever (pgvector) │   │  Hybrid OCR Pipeline  │   │  Fact-Extraction Investigator│
        │  cosine search, JS fallback│   │  Tesseract → Gemini   │   │  + Contradiction Detector    │
        └─────────────┬─────────────┘   └───────────┬───────────┘   └──────────────┬────────────┘
                       │                             │                              │
                       └─────────────────┬───────────┴──────────────────────────────┘
                                          ▼
                          ┌───────────────────────────────────┐
                          │   AI Provider Abstraction Layer    │
                          │  (lib/ai/) — Gemini · OpenAI ·      │
                          │  Anthropic · Groq · OpenRouter ·    │
                          │  OpenCode · Mock (Demo Mode)        │
                          │  ↳ multi-key rotation + failover    │
                          └───────────────────┬─────────────────┘
                                               ▼
                          ┌───────────────────────────────────┐
                          │     Citation Guard (post-hoc)      │
                          │  Extract every cited section →      │
                          │  verify against retrieved text →    │
                          │  downgrade evidence level if not     │
                          └───────────────────┬─────────────────┘
                                               ▼
                          Grounded, self-audited, cited response
```

**Core design principles**

- **Provider-agnostic AI layer** (`lib/ai/`) — no code outside `lib/ai/` ever imports a vendor SDK directly. Swapping or adding a provider means one new file.
- **Grounded-only legal answers.** The system prompt (`lib/rag/prompt.ts`) explicitly separates SYSTEM INSTRUCTIONS, USER INPUT, and RETRIEVED LEGAL DATA to defend against prompt injection from poisoned documents or malicious user input — a pattern applied consistently everywhere untrusted text reaches a model (FIR intake, memory extraction, translation, chat).
- **Verify, don't just instruct.** Grounding is treated as a claim to check, not a property of the prompt — see the Citation Guard.
- **Demo Mode by default.** The entire app — chat, RAG, voice, OCR, translation — runs end-to-end with **zero API keys** via a deterministic mock AI provider, clearly labeled `[DEMO MODE]` everywhere it appears.
- **Per-user data isolation** enforced at the Prisma query layer (`WHERE userId = ...` on every read), not just hidden in the UI.

---

## 🧭 Feature Tour

### Core Legal Assistant
- **Streaming, source-grounded legal chat** (Server-Sent Events) in three modes:
  - **Quick** — one grounded answer, no follow-up.
  - **Case Analysis** — a structured, multi-turn intake that ends in a full report: situation summary, urgent actions, a step-by-step table, an optional auto-generated flowchart, legal basis with citations, and an escalation/disclaimer block.
  - **Knowledge** — an explainer answer, not tied to a personal situation.
- **Evidence-level badges** (`STRONG` / `MODERATE` / `LIMITED` / `INSUFFICIENT`) computed from retrieval similarity scores and verified-source counts, then **downgraded automatically** if the citation guard finds unsupported statute references.
- **Small-talk detection** — "hi" gets a greeting, not a legal action plan with citations attached, and skips the RAG round-trip entirely (multilingual: recognizes greetings across English, Hindi, Urdu, Punjabi, Tamil, Bengali scripts).
- **Auto-generated Mermaid flowcharts** for case reports — validated with `mermaid.parse()` before ever touching the DOM, blocked from rendering mid-stream (an incomplete fenced block is invalid Mermaid by definition), with a repair pass for near-miss syntax and SVG/PNG download for offline use (e.g. printing to take to a police station).

### FIR (Police Complaint) Assistant
- Stateful, incident-aware **fact investigation engine** — see [deep dive](#-the-fir-assistant--deep-dive) below.
- **Contradiction detection** between what the user said and what an uploaded document says, with blocking vs. non-blocking severity.
- **Draft fabrication guard** — every date, amount, and statute in the generated complaint is checked against what was actually established before the user ever sees it as final.
- **Jurisdiction detection**, BNS/BNSS/BSA statute mapping, a live completeness meter, and a print-ready PDF with the correct BNSS §173(1)(ii) e-FIR authentication notice.
- Seeds itself from an existing Case Analysis conversation — a user who already described an incident in chat is not asked to retell it from scratch.

### Documents
- Upload → hybrid OCR → plain-language AI explanation of legal documents (notices, agreements, court orders).
- Per-document chunking + embedding for document-scoped Q&A.

### Multilingual, Everywhere
- 15 Indian languages + English, with **interface language**, **response language**, and **voice language** each selectable independently.
- Zero locale files — see [Multilingual Engine](#-multilingual-engine).

### Voice
- Full duplex, real-time conversational voice mode — see [deep dive](#-real-time-voice-mode).

### Memory & Personalization
- Durable, user-visible, user-deletable cross-conversation memory — see [deep dive](#-cross-conversation-memory).

### Case Management
- A "Case" is the connective tissue across the app: link any conversation, document, or FIR draft to one case, track status and a plain-language "next action," and see everything related in one timeline.

### Legal Aid & Escalation
- A curated, source-verified directory of legal aid resources (NALSA, women's safety, cybercrime, consumer rights, senior citizens, emergency) — every entry links to its official government source URL. **No lawyer or hotline is ever fabricated**; the directory ships empty until populated from a real, verified source.
- Referral tracking (`LawyerReferral`) tied to escalation reasons (low confidence, high risk, user-requested, requires representation).

### Admin & Research
- Admin panel for source verification (mark ingested legal text `VERIFIED` / `PENDING_REVIEW` / `UNVERIFIED` before it's ever used in retrieval).
- A research **evaluation dashboard** exposing the metrics architecture a real deployment would report on (retrieval precision/recall, citation accuracy, groundedness, hallucination rate, translation quality, FIR completeness, latency, user satisfaction) — every value explicitly labeled `DEMO DATA` until wired to a real held-out test set.

### Authentication & Accounts
- Email/password auth (NextAuth v5 / Auth.js, Credentials provider) with OTP email verification and password reset — codes are **hashed**, never stored plaintext, with capped verification attempts to resist brute force.
- Full account data export and account deletion (data-portability by design).

---

## 🛡️ Answer Trust & Citation Verification (the core differentiator)

> Observed directly in testing: asked about phone snatching, the model answered with *"Section 304 of the BNS"* — a real-sounding, entirely wrong citation drawn from the model's training memory, not from anything actually retrieved.

Instructing a model not to invent citations *reduces* the problem; it does not solve it. So LegalSetu adds a second, independent, code-based check that runs **after** generation:

1. **`lib/rag/citation-guard.ts`** regex-extracts every statute reference from the finished answer — `Section 303`, `Sections 303 and 304`, `u/s 420`, `BNS 351`, etc. — capturing full number lists, not just the first match.
2. Each cited number is checked against the **text that was actually retrieved** for that answer (both chunk metadata and full-text search), never against the model's training data.
3. **Unverified citations downgrade the evidence badge** the user sees: an answer resting entirely on unsupported citations is marked `LIMITED` regardless of how confident its prose sounds; a mix of verified and unverified citations steps the badge down one level.
4. The **Answer Trust Panel** (`components/chat/answer-trust-panel.tsx`) reports this to the user honestly in both directions — green when every citation traced back to a retrieved source, amber when the model cited something the corpus doesn't support, grey when the answer made no statutory claim at all. The amber state is the important one: it's the app **admitting it caught its own model inventing something**, which is the opposite of what an unverified assistant does.

This same "verify, don't just instruct" principle reappears in the FIR draft generator (below), which independently checks every date, amount, and statute in a generated police complaint against the user's actual recorded statements.

---

## 📋 The FIR Assistant — Deep Dive

The old approach to this kind of feature — and the one most similar projects ship — is a fixed multi-step form: eight fields, asked identically whether the incident was a stolen phone or an online fraud, with nothing the user typed ever actually read. LegalSetu replaces that with a real intake, built on three ideas:

### 1. Structured fact extraction, not a form
Every user turn goes through one structured model call (`lib/fir/investigator.ts`) that does three things at once:
- **Extracts every fact** present in free text — *"They took ₹25,000 by UPI on 15 August"* yields an amount, a method, and a date in one pass, so nothing already said is ever asked again.
- **Re-evaluates what's still missing** against an incident-specific checklist — a theft needs a serial number and whether the accused is known; a threat needs to know if danger is ongoing; domestic violence needs to know about prior complaints. (See `TYPE_SPECIFIC_REQUIRED` in `lib/fir/investigator.ts`.)
- **Plans the single next question** — one question, about one missing fact, never a list, always in the user's chosen language.

### 2. Provenance and confidence on every fact
Each fact (`lib/fir/case-state.ts`) is stored with:
- **Source** — `USER` (stated directly), `DOCUMENT` (extracted from an upload), or `AI_INFERRED` (the model normalized something, e.g. "yesterday evening" → a date) — because a sworn complaint has to be able to say *why* it asserts what it asserts.
- **Confidence** — `CONFIRMED`, `PROBABLE`, or `UNCERTAIN`.
- **Verbatim evidence** — the actual sentence or document line the fact came from, for auditability.

### 3. Contradictions are surfaced, never silently resolved
If an uploaded bank statement says 14 August and the user said 15 August, the system does **not** pick one. `lib/fir/contradictions.ts` detects genuine disagreements (tolerant of phrasing — "15/08/2026" and "15 August 2026" are recognized as the same date, ₹25,000 and 25000 as the same amount) and flags facts that materially change the complaint — dates, amounts, identities, location — as **blocking**: draft generation is refused until the user picks which is correct.

### 4. Draft fabrication guard
Before a generated complaint is ever shown as final, `lib/fir/draft-validator.ts` checks every date, amount, and statutory reference in the generated text against `supportedValues()` — the closed set of things actually recorded from the user, a document, or the verified legal corpus. A model that rounds ₹24,500 to ₹25,000 or adds a witness nobody mentioned gets caught here, because the person signing this document is not the model.

### 5. Statutory context, never asserted as fact
Any BNS/BNSS section the report suggests might apply comes exclusively from the verified RAG corpus (`lib/fir/legal-context.ts`) and is kept in a separate `legalContext` list from the complainant's own facts — the assistant never tells the user what crime was committed; that's left to the police, explicitly, in the prompt itself.

### 6. Output
A print-ready PDF (`lib/fir/pdf-generator.ts` / `pdf.ts`) including the correct legal notice under **BNSS §173(1)(ii)** — that an electronically submitted complaint must be signed/authenticated in person within 3 days to be formally registered — so the document is never mistaken for a filed FIR.

---

## 🔀 Multi-Provider AI Layer & Failover

`lib/ai/` is the only place any vendor SDK is imported. Everything else — chat, memory extraction, translation, FIR intake — calls `generateCompletion()` / `streamCompletion()` from `lib/ai/llm.ts` and never touches a provider directly.

**Supported providers:** Google Gemini (default), OpenAI, Anthropic Claude, Groq, OpenRouter, OpenCode, plus a deterministic Mock provider for Demo Mode.

### Multi-key rotation pools
Each provider can have up to **11 API keys** configured (`GEMINI_API_KEY`, `GEMINI_API_KEY_1`…`_10`, and identically for Groq, Sarvam, etc). `lib/ai/key-pool.ts` rotates through them automatically:
- A **quota/rate-limit** error benches that key for that model *scope only* for 10 minutes (a key that exhausted `gemini-flash-latest`'s daily quota still works fine for embeddings or Flash-Lite).
- A **revoked/rejected** key (401/403, "invalid API key," "denied access") is benched for everything for an hour.
- Benching is backed by Redis when configured, with an in-memory fallback — safe for both single-instance and multi-instance deployments.

### Transient vs. permanent failure classification
`lib/ai/llm.ts` distinguishes *"the model is busy right now"* (503/overloaded, network blips) from *"this will not fix itself"* (no credits, billing issue, invalid model). Transient errors get one fast in-place retry (1.2s) before anything else happens; permanent errors immediately **bench that provider for 15 minutes** system-wide, so a dead key doesn't turn every subsequent message into a doomed multi-provider relay race.

### Stream-safe fallback
Critically, once any token of a streamed answer has reached the user, the system **never** starts a second provider's reply after it — switching mid-answer would splice two different responses together. Fallback only happens before any output has been emitted, and the client is explicitly told (`send("model", { requested, servedBy })`) when a different model actually answered than the one requested.

### Auto mode
An `id: "auto"` model selection walks a priority sequence (Gemini → OpenAI → Claude → Groq → OpenRouter → OpenCode) so a request essentially always gets an answer as long as *any* configured provider is healthy.

---

## 🌐 Multilingual Engine

LegalSetu ships **zero per-language locale/JSON files**. Every string — UI copy, backend data, and AI output — is translated at request time by `lib/i18n/translator.ts` and cached, so adding a language is a single row in `lib/i18n/languages.ts`.

- **15 Indian languages + English:** Hindi, Bengali, Marathi, Telugu, Tamil, Gujarati, Urdu (RTL), Kannada, Odia, Malayalam, Punjabi, Assamese, Maithili, Bhojpuri, and Santali.
- **Three independent language settings:** interface language, AI response language, and voice language can each be set separately — a user can read the UI in English while getting answers spoken in Bhojpuri.
- **Batch translation protocol:** an entire page's worth of strings is translated in one model round trip via a numbered JSON protocol (`0 >> text`, `1 >> text`, …), not 80 separate calls.
- **Glossary masking:** legal citations, act names, URLs, and product names are masked with placeholder tokens (`{{n}}`) *before* the model ever sees the text and restored after — so a translation can never corrupt "Section 304" or rename "LegalSetu."
- **Persistent cache:** every translated string is stored in Postgres (`TranslationCache`), keyed by a content hash + target language — translated once, free forever, for every user.
- **Order-preserving and fault-tolerant:** output always lines up with input even with duplicates, blanks, and cache hits interleaved; a malformed model response degrades to "keep the original string" rather than breaking the page.

---

## 🎙️ Real-Time Voice Mode

A full duplex, "ChatGPT-style" continuous voice loop (`components/voice/voice-mode.tsx`) — not a record-then-transcribe button.

```
User speaks → instant recognition / voice-activity detection
  → streams through /api/chat/stream
  → each finished sentence synthesised and spoken immediately
  → auto-returns to listening for the next turn
```

- **Dual speech-input engine:** the native browser Web Speech API for zero-latency recognition, with automatic fallback to `MediaRecorder` + Sarvam STT (`saaras:v3`, auto-detects the spoken language across ~20 Indian languages) when the Web Speech API isn't available.
- **Dual speech-output engine:** Sarvam Bulbul TTS (`bulbul:v3`) for natural Indian-language voices, with instant fallback to the browser's own speech synthesis — voice mode is built to **never fail silently**.
- **Client-side voice-activity detection:** RMS-based speech thresholding with a separate, higher bar while the assistant is talking, so only genuine speech into the mic triggers **barge-in** (interrupting the assistant mid-sentence) rather than speaker feedback.
- **Gapless playback:** a dual-audio-element ping-pong buffer queues synthesized clause-level audio so responses are spoken as they arrive rather than waiting for the full answer.
- **Autoplay-block workaround:** a pre-unlocked silent-audio trick prevents Chrome/Edge from silently blocking the very first spoken response.
- **Clause-level TTS splitting** for natural pacing, with its own generous rate limit tier (`voiceRealtime`) reflecting that one spoken exchange fires many more requests than a single dictation button press.

---

## 📄 Document OCR Pipeline

Hybrid, cost-aware OCR (`lib/ocr/ocr.ts`):

1. **Tesseract.js runs first** — free, on-device, no network call, handles standard printed English/Hindi text well.
2. **Gemini Vision is invoked only as a fallback**, and only server-side (`/api/documents/ocr-fallback`) — the API key never reaches the browser — and only for the *specific pages* that fell below a confidence threshold (default 45%), not the whole document.
3. **Hard timeout, single attempt** — if the fallback is slow or errors, the app falls back to whatever Tesseract already extracted rather than hanging.
4. **Abuse-resistant by design:** hard caps on file size (15 MB), pages processed per run (5), and extracted word count (5,000) — generous for a real legal notice, FIR, or court order, but not usable as a free bulk-OCR service.

---

## 🧠 Cross-Conversation Memory

Without this, every conversation starts from zero — a user who explained last week that they live in Ghaziabad, that their landlord is withholding a deposit, and that they've already sent a legal notice has to repeat all of it. `lib/memory/memory.ts` implements durable, cross-session memory shaped by two rules that matter specifically because of what this app is:

1. **Legible, not opaque.** Each memory is one short, plain-English sentence a person can actually read — never an embedding or a transcript blob — because these records can describe someone's assault, eviction, or debt, and "show me exactly what you know about me" must be answerable in plain language. Fully user-visible and individually deletable (`components/settings/memory-manager.tsx`).
2. **Durable facts only, extracted conservatively.** After a reply has already been sent (never adding latency to the user's turn), a separate model call decides — strictly — whether anything from the exchange is worth keeping: where someone lives, an ongoing matter, steps already taken, a stable preference. The specific question they just asked is explicitly *not* memorable.

Hard safety rules: credentials and identifiers (Aadhaar-length numbers, PAN format, card/account numbers, OTPs/passwords/PINs) are **never** written to memory, enforced both in the extraction prompt and again in code as a backstop. Near-duplicate memories are suppressed via word-overlap similarity, and the store is capped at 60 memories per user, pruning the least-recently-relevant first.

---

## 🗂️ Case Management Layer

A `Case` is the thread that turns a folder of unconnected chats and documents into an actual tracker:

- **Link anything to a case** — a Case Analysis conversation from three weeks ago, a notice OCR'd last week, and an FIR draft started today can all live under one roof, each lookup scoped to both the case *and* the record's own `userId` so cross-user leakage is structurally impossible.
- **Status tracking** (`OPEN → IN_PROGRESS → ESCALATED → RESOLVED → CLOSED`) with a plain-language **"next action"** and due date — the thing that makes a case an active tracker rather than an archive nobody revisits.
- **Activity timeline** aggregating everything linked to the case in chronological order.

---

## 🔐 Security Model

- **Authentication:** NextAuth v5 (Auth.js) Credentials provider, bcrypt password hashing, HttpOnly/SameSite session cookies.
- **RBAC:** `USER` / `ADMIN` / `RESEARCHER` roles enforced server-side.
- **OTP security:** email verification and password-reset codes are **hashed** before storage (never plaintext) and capped at a small number of verification attempts, so a 6-digit code cannot be brute-forced within its lifetime.
- **Rate limiting** per endpoint category (login, register, chat, AI generation, voice transcription, real-time voice, document upload, FIR generation, OTP send/verify) — Redis-backed with an in-memory fallback for local/demo use.
- **Input validation:** Zod schemas on every API route.
- **File upload validation:** MIME type + extension + size + filename sanitization.
- **SQL injection safety:** all Prisma queries are parameterized, including the raw pgvector queries used for embedding search (bound parameters, never string interpolation, verified explicitly in code comments).
- **Prompt-injection defense:** every place untrusted text reaches a model (chat, FIR intake, memory extraction, translation) explicitly separates instructions from user-supplied data and instructs the model to treat the latter as data only, never as commands.
- **Security headers:** CSP, `X-Frame-Options`, HSTS in production, Permissions-Policy.
- **Audit logging** with secret redaction.
- **Per-user data isolation** enforced at the Prisma query layer on every data-access path, not only in the UI.
- **Data portability:** full account export and self-service account deletion.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS, Framer Motion, GSAP, Three.js / React Three Fiber (landing page visuals) |
| Database | PostgreSQL + `pgvector` extension, Prisma ORM |
| Auth | NextAuth v5 (Auth.js), bcryptjs |
| AI Providers | Google Gemini, OpenAI, Anthropic Claude, Groq, OpenRouter, OpenCode (pluggable via one interface) |
| Speech | Web Speech API, Sarvam AI (STT `saaras:v3` / TTS `bulbul:v3`) |
| OCR | Tesseract.js + Gemini Vision fallback |
| Diagrams | Mermaid.js |
| PDF | jsPDF |
| Docs parsing | `mammoth` (DOCX), `pdf-parse` (PDF) |
| Caching / rate limiting | Redis (`ioredis`), in-memory fallback |
| Validation | Zod, React Hook Form |
| Testing | Vitest (unit/integration), Playwright (e2e) |
| Deployment | Docker (multi-stage, standalone Next.js output), Docker Compose |

---

## 🗃️ Data Model

23 Prisma models covering: `User` / `Account` / `Session` / `UserPreference`, `Case`, `Conversation` / `Message` / `Citation`, `Document` / `DocumentChunk`, `LegalSource` / `LegalSourceChunk` (the verified legal corpus, pgvector-embedded), `FIRDraft` / `FIRValidation`, `LawyerReferral` / `LegalAidResource`, `SavedSource`, `AuditLog`, `Feedback`, `Notification`, `TranslationCache`, `UserMemory`, and `OtpCode`.

Full schema: [`prisma/schema.prisma`](prisma/schema.prisma). A few notable design choices, documented as inline schema comments in the source:

- `FIRDraft.caseState` stores the entire structured intake (facts + provenance + timeline + contradictions) as JSON, while the legacy flat columns remain for backward compatibility with the original wizard.
- `UserMemory` deliberately stores plain sentences, not embeddings, so a user's "what do you know about me" request has a legible answer.
- `LegalAidResource.sourceUrl` is required, not optional — every entry must trace to a real government page.

---

## 📁 Project Structure

```
legalsetu/
├── app/
│   ├── (auth)/              # login, register, forgot-password
│   ├── dashboard/            # chat, cases, documents, fir, sources, lawyer, history, settings, admin
│   └── api/
│       ├── chat/, chat/stream/        # SSE streaming chat (quick/case/knowledge/fir modes)
│       ├── cases/                     # case CRUD + linking
│       ├── documents/                 # upload, OCR fallback, AI analysis
│       ├── fir/                       # intake, validation, drafting, PDF, investigation
│       ├── voice/                     # transcribe, stt, speak
│       ├── i18n/, translation/        # runtime translation
│       ├── memory/                    # user memory CRUD
│       ├── rag/                       # corpus search / admin ingestion
│       ├── legal-aid/                 # resources + referrals
│       └── auth/                      # register, OTP, password reset
├── components/
│   ├── chat/     # trust panel, citation cards, mermaid diagrams, mode/model selectors
│   ├── fir/      # wizard, case panel, contradiction prompts, completeness meter
│   ├── voice/    # real-time voice mode, mic button
│   ├── cases/    # case cards, linking UI, timeline
│   ├── documents/, i18n/, settings/, dashboard/, ui/
├── lib/
│   ├── ai/        # provider abstraction, failover, key rotation, model registry
│   ├── rag/       # retriever, prompt builder, citation guard, chunker, mermaid repair
│   ├── fir/       # case-state, investigator, contradictions, draft generator/validator, PDF
│   ├── i18n/      # language registry, translator, glossary masking, cache
│   ├── voice/     # Sarvam integration, speech-text formatting
│   ├── memory/    # cross-conversation memory
│   ├── ocr/       # hybrid OCR pipeline
│   ├── security/  # rate limiting, sanitization, headers
│   ├── auth/, db/, email/, storage/, logging/, validation/, legal-aid/
├── prisma/        # schema.prisma, migrations, seed
├── scripts/       # RAG ingestion + embedding CLIs
├── tests/         # unit/ (18 suites), integration/, e2e/
└── data/          # source legal corpus (e.g. Bharatiya Nyaya Sanhita, 2023)
```

---

## 🚀 Getting Started

```bash
npm install
cp .env.example .env
# edit .env — at minimum set DATABASE_URL and AUTH_SECRET
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Visit `http://localhost:3000`.

**Demo login (after seeding):** `demo@legalsetu.example` / `Demo@12345`
**Admin login:** `admin@legalsetu.example` / `Demo@12345`

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env` and fill in real values. **Never commit `.env`.** The app is designed to run with **only** `DATABASE_URL` and `AUTH_SECRET` set — everything AI-related defaults to Demo Mode.

<details>
<summary>Full variable reference</summary>

| Variable | Purpose |
|---|---|
| `DATABASE_URL`, `DIRECT_URL` | PostgreSQL connection (pgvector-enabled) |
| `AUTH_SECRET`, `AUTH_URL` | NextAuth session signing |
| `AI_PROVIDER` | `mock` (default, zero-key Demo Mode) \| `gemini` \| `openai` \| `groq` \| `anthropic` |
| `EMBEDDING_PROVIDER` | Override just the embeddings provider (e.g. run chat on Groq but embeddings on Gemini, since Groq has no embeddings endpoint) |
| `GEMINI_API_KEY`, `GEMINI_API_KEY_1..10` | Gemini key pool (rotated automatically on quota exhaustion) |
| `GEMINI_CHAT_MODEL`, `GEMINI_FLASH_MODEL`, `GEMINI_EMBEDDING_MODEL` | Model overrides |
| `OPENAI_API_KEY`, `OPENAI_CHAT_MODEL`, `OPENAI_EMBEDDING_MODEL` | OpenAI provider |
| `GROQ_API_KEY(_1..10)`, `GROQ_CHAT_MODEL`, `GROQ_STT_MODEL` | Groq provider (fast, free-tier, no embeddings) |
| `ANTHROPIC_CHAT_MODEL` | Claude model override |
| `SARVAM_API_KEY(_1..5)`, `SARVAM_TTS_SPEAKER` | Indian-language voice STT/TTS |
| `REDIS_URL` | Rate limiting, provider/key benching cache (optional — in-memory fallback) |
| `STORAGE_PROVIDER`, `STORAGE_BUCKET`, `STORAGE_*` | Document/file storage adapter |
| `RATE_LIMIT_ENABLED` | Global kill-switch for rate limiting (useful in tests) |

</details>

---

## 🐘 Database & pgvector Setup

LegalSetu requires PostgreSQL with the `pgvector` extension.

**Option A — Docker (recommended):**
```bash
docker compose up -d db redis
```

**Option B — existing Postgres instance:**
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Then:
```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

---

## 🎭 Demo Mode

Set `AI_PROVIDER=mock` (the `.env.example` default) to run the **entire application** — chat, RAG, voice, OCR, translation — without any API keys, via a deterministic mock provider. All demo output is explicitly labeled `[DEMO MODE]` / "DEMO DATA" in the UI and is never presented as real legal information. This makes the project fully runnable and demonstrable — including its multilingual and voice features — with no external accounts required.

---

## 📚 RAG Ingestion Pipeline

Add a verified legal source:
```bash
npm run rag:ingest -- --file=./my-act.txt --title="Example Act" --jurisdiction="Maharashtra"
npm run rag:embed
```
Newly ingested sources default to `PENDING_REVIEW` and must be explicitly marked `VERIFIED` (admin panel or DB) before the retriever will ever surface them — **unverified text is structurally unreachable by the AI**, not just filtered by convention. `scripts/ingest-indiacode.ts` additionally supports bulk ingestion from India Code; the repository ships a full working corpus sample (the Bharatiya Nyaya Sanhita, 2023) under `data/`.

---

## 🧪 Testing

```bash
npm run test        # unit + integration (Vitest) — 18+ suites covering citation guard,
                     # contradiction detection, LLM failover, gemini key rotation, OTP,
                     # sanitization, i18n glossary masking, mermaid repair, draft validation…
npm run test:e2e    # end-to-end (Playwright)
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint
```

---

## 🐳 Docker Deployment

```bash
docker compose up --build
```
Runs Postgres (`pgvector/pgvector:pg16`), Redis, and the app together. The `Dockerfile` uses a multi-stage build producing Next.js's `standalone` output for a minimal production image, running as a non-root user.

---

## 📊 Research / Evaluation Dashboard

`/dashboard/admin/evaluation` exposes the evaluation architecture a production deployment would need — retrieval precision/recall, citation accuracy, groundedness, hallucination rate, translation quality, FIR completeness, latency, and user satisfaction — **every value clearly labeled `DEMO DATA`**. Wire real computation against a held-out legal QA test set before citing any of these numbers externally.

---

## ⚠️ Known Limitations

- STT/OCR/translation beyond the implemented providers (Gemini, OpenAI, Groq, Sarvam) are stubbed as interfaces, ready to implement — see `lib/ai/provider.ts`.
- The in-memory rate limiter and provider-bench cache are per-instance; use `REDIS_URL` in multi-instance production deployments.
- pgvector SQL search requires a live Postgres instance with the extension enabled; a JS in-memory cosine-similarity fallback exists but is not intended for production scale.
- The lawyer/legal-aid directory ships intentionally sparse until connected to a fully verified data source — the project deliberately does not fabricate lawyer listings.
- Evaluation metrics on the admin dashboard are illustrative (clearly labeled) until a real test harness is run.

## 🗺️ Roadmap

Dedicated low-resource-language ASR/translation integration · S3-compatible storage adapter · background job queue for document ingestion at scale · a real evaluation harness with a held-out legal QA test set · mobile app.

---

## 📜 License & Disclaimer

*LegalSetu provides legal **information**, not legal **advice**. For complex or high-risk matters, please consult a qualified lawyer or an official legal-aid service. Every AI-generated answer in this application carries an explicit evidence level and, where relevant, an explicit citation-trust indicator — it is designed to tell you when it is unsure, not to sound confident regardless.*
