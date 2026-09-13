import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { apiError } from "@/lib/utils/api-response";
import { chatMessageSchema } from "@/lib/validation/schemas";
import { retrieveRelevantChunks } from "@/lib/rag/retriever";
import { buildRAGMessages, buildLanguageDirective, type ChatMode } from "@/lib/rag/prompt";
import { isSmallTalk, buildSmallTalkPrompt } from "@/lib/rag/smalltalk";
import { runInvestigationTurn } from "@/lib/fir/investigator";
import { generateComplaintDraft } from "@/lib/fir/draft-generator";
import { retrieveLegalContext } from "@/lib/fir/legal-context";
import { emptyCaseState, type FIRCaseState } from "@/lib/fir/case-state";
import { buildMemoryBlock, extractMemories } from "@/lib/memory/memory";
import { parseLeadingMarker, type MessageKind } from "@/lib/rag/marker";
import {
  auditCitations,
  adjustEvidenceLevel,
  buildCitationWarning,
} from "@/lib/rag/citation-guard";
import { streamCompletion } from "@/lib/ai/llm";
import type { EvidenceLevel } from "@/lib/rag/types";
import { getAIProvider } from "@/lib/ai/provider";
import type { ChatMessage } from "@/lib/ai/provider";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

/** How much prior conversation to feed back to the model as context. */
const HISTORY_TURN_LIMIT = 16;
/** How much of the running case narrative to embed for retrieval. */
const CASE_NARRATIVE_MAX_CHARS = 2500;

/**
 * Server-Sent-Events streaming chat endpoint. Three modes share this
 * one route (see lib/rag/prompt.ts for what each means):
 *   quick     — one grounded answer, no follow-up.
 *   case      — intake first, report (with a flowchart) once ready.
 *   knowledge — explainer, not tied to a personal situation.
 *
 * Event order:
 *   retrieval -> evidence level + source count, sent BEFORE generation
 *                starts so the UI can show grounding immediately
 *   kind      -> "question" | "report" | "answer" | "explainer" — tells
 *                the client which card to render, sent as early as
 *                possible (immediately for quick/knowledge, as soon as
 *                the leading marker resolves for case mode)
 *   token     -> incremental text deltas (marker already stripped)
 *   done      -> citations, evidence level, demo flag, conversation id
 *   error     -> a user-readable failure message
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return apiError("UNAUTHORIZED", "You must be signed in.", 401);
  }
  const userId = (session.user as any).id as string;

  const rateLimit = await checkRateLimit(userId, "aiGeneration");
  if (!rateLimit.success) {
    return apiError("RATE_LIMITED", "Too many requests.", 429);
  }

  const body = await req.json().catch(() => null);
  const parsed = chatMessageSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Invalid message.", 422);
  }

  const { content, language, mode, voice, modelId } = parsed.data;
  const encoder = new TextEncoder();

  // Usage check (import from lib/ai/usage and models)
  const { getModelById } = await import("@/lib/ai/models");
  const { incrementAndCheckUsage } = await import("@/lib/ai/usage");
  
  const model = getModelById(modelId);
  const usage = await incrementAndCheckUsage(userId, model.provider, model.id);
  
  if (!usage.allowed) {
    return apiError("DAILY_USER_LIMIT", `Daily limit reached for ${model.name}. Please try another model or try again tomorrow.`, 429);
  }

  const stream = new ReadableStream({
    async start(controller) {
      // The client can vanish mid-turn — voice mode does it deliberately
      // every time the user talks over an answer (barge-in), and a
      // browser tab closing does the same. Enqueuing into a controller
      // that is already closed throws ERR_INVALID_STATE, which would
      // otherwise surface as a spurious "Streamed chat failed" error and
      // abort the generation's own bookkeeping.
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          closed = true;
        }
      };

      const startedAt = Date.now();

      try {
        // ---- Load prior turns of this thread, if any. ----
        // This is what makes "case" mode's intake actually work: the
        // model needs to remember what it already asked and what the
        // user already answered, and it is also what has been missing
        // from ordinary follow-up questions in every mode until now.
        let priorMessages: {
          role: "USER" | "ASSISTANT";
          content: string;
          kind: string | null;
        }[] = [];

        let conversationId = parsed.data.conversationId;
        if (conversationId) {
          const owned = await prisma.conversation.findFirst({
            where: { id: conversationId, userId },
            select: { id: true },
          });
          if (!owned) {
            conversationId = undefined;
          } else {
            const rows = await prisma.message.findMany({
              where: { conversationId, role: { in: ["USER", "ASSISTANT"] } },
              orderBy: { createdAt: "asc" },
              take: HISTORY_TURN_LIMIT,
              select: { role: true, content: true, kind: true },
            });
            // The WHERE clause already restricts this to USER/ASSISTANT
            // rows; Prisma's generated type just does not narrow on it.
            priorMessages = rows as typeof priorMessages;
          }
        }

        const history: ChatMessage[] = priorMessages.map((m) => ({
          role: m.role === "USER" ? "user" : "assistant",
          content: m.content,
        }));

        // Case mode's intake bounds are enforced from what is actually
        // on record, never from the model's own reading of the
        // transcript. The verbatim list of questions already asked is
        // what stops it asking the same thing twice in a rephrased
        // form — the failure this was reported for.
        const intake = {
          askedQuestions: priorMessages
            .filter((m) => m.role === "ASSISTANT" && m.kind === "question")
            .map((m) => m.content),
          userAnswers: priorMessages
            .filter((m) => m.role === "USER")
            .map((m) => m.content),
        };

        // ---- Generate FIR ----
        // A stateful intake rather than a question/answer turn: it
        // collects the facts of an incident one question at a time and
        // ends in a downloadable complaint draft. Reuses the same
        // engine, validator and PDF renderer as the FIR Assistant tab.
        if (mode === "fir" && !isSmallTalk(content)) {
          let firDraftId = parsed.data.firDraftId;

          if (firDraftId) {
            const owned = await prisma.fIRDraft.findFirst({
              where: { id: firDraftId, userId },
              select: { id: true },
            });
            if (!owned) firDraftId = undefined;
          }

          const isNewComplaint = !firDraftId;

          if (!firDraftId) {
            const created = await prisma.fIRDraft.create({
              data: { userId, language },
              select: { id: true },
            });
            firDraftId = created.id;
          }

          const row = await prisma.fIRDraft.findUnique({
            where: { id: firDraftId },
            select: { caseState: true },
          });

          let currentState =
            (row?.caseState as unknown as FIRCaseState) ?? emptyCaseState(language);

          // Handoff from Case Analysis / Quick Answer: the user has
          // already described the incident at length in this thread.
          // Seed the complaint from that account first, so the intake
          // asks only for what is genuinely still missing instead of
          // making them tell the whole story a second time.
          if (isNewComplaint) {
            const priorAccount = priorMessages
              .filter((m) => m.role === "USER")
              .map((m) => m.content)
              .join("\n\n")
              .slice(-CASE_NARRATIVE_MAX_CHARS);

            if (priorAccount.trim().length > 30) {
              const seeded = await runInvestigationTurn(currentState, priorAccount);
              // Keep only the facts learned; the question it planned is
              // discarded, because the user's actual message is answered
              // in the turn below.
              currentState = {
                ...seeded.state,
                askedQuestions: [],
                pendingKey: undefined,
                stage: "INVESTIGATING",
              };
            }
          }

          const turn = await runInvestigationTurn(currentState, content);
          let nextState = turn.state;

          send("kind", { kind: turn.complete ? "report" : "question" });

          let replyText: string;

          if (turn.complete) {
            // Statutory context comes from the verified corpus only, and
            // the draft is checked for fabricated dates, amounts and
            // sections before the user ever sees it.
            if (nextState.legalContext.length === 0) {
              nextState = { ...nextState, legalContext: await retrieveLegalContext(nextState) };
            }
            const generated = await generateComplaintDraft(
              nextState,
              session.user.name ?? undefined
            );
            replyText = generated.plainText;
            nextState = { ...nextState, stage: "DRAFTED", draftVersion: nextState.draftVersion + 1 };

            await prisma.fIRDraft.update({
              where: { id: firDraftId },
              data: {
                caseState: nextState as unknown as object,
                draftText: generated.plainText,
                draftVersion: nextState.draftVersion,
              },
            });
          } else {
            replyText = turn.nextQuestion?.text ?? "Could you tell me a little more?";
            await prisma.fIRDraft.update({
              where: { id: firDraftId },
              data: { caseState: nextState as unknown as object },
            });
          }

          // Emitted as one chunk: these are short questions, and a draft
          // must not appear to be written live when it was assembled.
          send("token", { delta: replyText });

          let convId = conversationId;
          let userMessageId: string | undefined;
          let assistantMessageId: string | undefined;
          try {
            if (!convId) {
              const conv = await prisma.conversation.create({
                data: { userId, title: content.slice(0, 60) },
              });
              convId = conv.id;
            }
            const um = await prisma.message.create({
              data: { conversationId: convId, role: "USER", content, language, mode },
              select: { id: true },
            });
            userMessageId = um.id;
            const am = await prisma.message.create({
              data: {
                conversationId: convId,
                role: "ASSISTANT",
                content: replyText,
                language,
                mode,
                kind: turn.complete ? "report" : "question",
              },
              select: { id: true },
            });
            assistantMessageId = am.id;
            await prisma.conversation.update({
              where: { id: convId },
              data: { updatedAt: new Date() },
            });
          } catch (persistErr) {
            logger.warn("FIR chat persistence skipped", {
              errorType: String(persistErr).slice(0, 200),
            });
          }

          send("done", {
            citations: [],
            evidenceLevel: "INSUFFICIENT",
            citationWarning: null,
            unverifiedCitations: [],
            verifiedCitations: [],
            isDemo: (await getAIProvider()).isDemo,
            conversationId: convId,
            userMessageId,
            assistantMessageId,
            kind: turn.complete ? "report" : "question",
            mode,
            firDraftId,
            // Drives the download button once the draft exists.
            firComplete: turn.complete,
            safetyAlert: turn.safetyAlert,
          });

          logger.info("FIR chat turn completed", {
            userId,
            complete: turn.complete,
            factCount: nextState.facts.length,
          });
          return;
        }

        // ---- Recall ----
        // What we already know about this person, from earlier
        // conversations. Loaded before the prompt is built so they never
        // have to re-explain their situation from scratch.
        const memoryBlock = await buildMemoryBlock(userId);

        // ---- Small talk ----
        // "hi" should get a greeting, not a legal action plan with
        // statutes attached. Detected before retrieval so a greeting
        // costs no vector search and returns almost instantly.
        const smallTalk = isSmallTalk(content);

        // ---- Retrieval ----
        // Case mode searches the WHOLE case narrative so far (it gets
        // more specific as the user answers questions), not just the
        // latest one-line reply like "yes" or "last Tuesday".
        const retrievalQuery =
          mode === "case"
            ? [...priorMessages.filter((m) => m.role === "USER").map((m) => m.content), content]
                .join(" \n ")
                .slice(-CASE_NARRATIVE_MAX_CHARS)
            : content;

        const retrievalStart = Date.now();
        const { chunks, evidenceLevel } = smallTalk
          ? {
              chunks: [] as Awaited<ReturnType<typeof retrieveRelevantChunks>>["chunks"],
              evidenceLevel: "INSUFFICIENT" as const,
            }
          : await retrieveRelevantChunks(retrievalQuery);
        const retrievalLatencyMs = Date.now() - retrievalStart;

        const provider = await getAIProvider();

        send("retrieval", {
          evidenceLevel,
          sourceCount: chunks.length,
          isDemo: provider.isDemo,
        });

        // Quick/knowledge answers are always one thing — tell the
        // client immediately rather than making it wait for content.
        // A greeting is always a plain answer, whatever the mode.
        if (smallTalk) {
          send("kind", { kind: "answer" });
        } else if (mode !== "case") {
          send("kind", { kind: mode === "quick" ? "answer" : "explainer" });
        }

        // A spoken answer has to be short: the listener cannot skim, and
        // a table or flowchart read aloud is noise. `voice` swaps in a
        // completely different answer-format instruction inside
        // buildRAGMessages rather than appending a note asking the
        // model to summarize afterward — an earlier version tried the
        // append approach and the model followed the detailed, explicit
        // structure it was given ("Never omit 'Legal basis' or
        // 'Disclaimer'") over a vaguer instruction bolted on at the end.
        // Retrieval, citations and the mode's own logic are unchanged;
        // only the shape of the prose does.
        const baseMessages = smallTalk
          ? [
              {
                role: "system" as const,
                content: buildSmallTalkPrompt(buildLanguageDirective(language)),
              },
              ...history,
              { role: "user" as const, content },
            ]
          : buildRAGMessages(
              content,
              chunks,
              history,
              language,
              mode as ChatMode,
              intake,
              voice
            );

        // Appended to the leading system message rather than added as a
        // separate turn, so it cannot be mistaken for something the user
        // said in this conversation.
        const messages = memoryBlock
          ? baseMessages.map((m, i) =>
              i === 0 && m.role === "system"
                ? { ...m, content: m.content + memoryBlock }
                : m
            )
          : baseMessages;

        // ---- Generation, with marker resolution for case mode ----
        let rawAnswer = ""; // exactly what the model produced, marker included
        let answer = ""; // what has been shown to the user so far (marker stripped)
        let kind: MessageKind | "answer" | "explainer" = smallTalk
          ? "answer"
          : mode === "case"
            ? ("report" as MessageKind)
            : mode === "quick"
              ? "answer"
              : "explainer";
        let markerResolved = mode !== "case" || smallTalk;
        let servedBy: string | undefined;
        let servedByAnnounced = false;

        for await (const chunk of streamCompletion(messages, {
          temperature: 0.2,
          modelId,
          // Room for the full structure: answer, actions, steps table,
          // an optional flowchart, legal basis and disclaimer.
          // A case report is the longest thing this app produces:
          // answer, urgent actions, a 4-7 row table, a flowchart,
          // legal basis, escalation and disclaimer. At 2600 it was
          // being truncated mid-sentence and losing the flowchart
          // entirely. Greetings and clarifying questions are short,
          // so they never approach any of these ceilings.
          //
          // Voice mode deliberately does NOT lower this ceiling to make
          // answers short. It is tempting to think a smaller cap gets a
          // smaller (and thus faster, cheaper) answer, but this model
          // spends tokens on internal "thinking" out of the SAME budget
          // before it writes anything, and that overhead scales with
          // the cap and with prompt complexity — the full RAG prompt
          // (retrieved chunks, citation rules, language directive) is
          // far heavier than it looks. Verified empirically against the
          // real production prompt: 400 hit MAX_TOKENS after half a
          // sentence, and even 1600 still cut a real grounded answer off
          // mid-sentence. Brevity here comes entirely from the
          // voiceDirective instruction above ("at most 4 short
          // sentences") — the model stops on its own once it has said
          // that much, so a generous ceiling costs nothing in practice
          // and only removes the risk of a truncated legal answer.
          maxTokens: mode === "case" ? 5000 : mode === "knowledge" ? 3500 : 3000,
        })) {
          // Several fallbacks may be tried before one produces text; only
          // the provider that actually answers is worth telling the user.
          if (chunk.servedBy) servedBy = chunk.servedBy;
          if (!chunk.delta) continue;
          if (servedBy && !servedByAnnounced) {
            send("model", { requested: model.name, servedBy });
            servedByAnnounced = true;
          }
          rawAnswer += chunk.delta;

          if (!markerResolved) {
            const result = parseLeadingMarker(rawAnswer);
            if (!result.resolved) continue; // still buffering, nothing to show yet

            markerResolved = true;
            kind = result.kind ?? "report";
            send("kind", { kind });

            if (result.rest) {
              answer += result.rest;
              send("token", { delta: result.rest });
            }
            continue;
          }

          answer += chunk.delta;
          send("token", { delta: chunk.delta });
        }

        // The stream ended before the marker ever resolved (a very
        // short or truncated reply) — fall back to showing everything
        // gathered rather than silently dropping the answer.
        if (!markerResolved) {
          const result = parseLeadingMarker(rawAnswer || " ".repeat(40));
          kind = result.kind ?? "report";
          answer = result.rest || rawAnswer;
          send("kind", { kind });
          if (answer) send("token", { delta: answer });
        }

        // Some providers end a stream cleanly with no text at all (a safety
        // block, a reasoning model that spent its whole budget thinking).
        // Treat that as a failure so the user gets a message — and nothing
        // empty is saved into their conversation history.
        if (!answer.trim()) {
          throw new Error("The model returned an empty response.");
        }

        // A greeting makes no legal claim either — same treatment.
        const isQuestion = kind === "question" || smallTalk;

        // A clarifying question carries no legal claims — auditing it
        // against the corpus would only ever produce noise.
        const audit = isQuestion
          ? { verified: [], unverified: [], hasNoCitations: true }
          : auditCitations(answer, chunks);
        const finalEvidence = isQuestion
          ? evidenceLevel
          : adjustEvidenceLevel(evidenceLevel, audit);
        const citationWarning = isQuestion ? null : buildCitationWarning(audit);

        if (audit.unverified.length > 0) {
          logger.warn("Unverified citations in answer", {
            userId,
            unverified: audit.unverified,
            verified: audit.verified,
          });
        }

        // ---- Persistence ----
        // Best-effort — a database hiccup must not lose the answer the
        // user is already reading.
        let userMessageId: string | undefined;
        let assistantMessageId: string | undefined;

        try {
          if (!conversationId) {
            const conv = await prisma.conversation.create({
              // First question becomes the thread title; the user can
              // rename it afterwards.
              data: { userId, title: content.slice(0, 60) },
            });
            conversationId = conv.id;
          }

          const userMessage = await prisma.message.create({
            data: { conversationId, role: "USER", content, language, mode },
            select: { id: true },
          });
          userMessageId = userMessage.id;

          const assistantMessage = await prisma.message.create({
            data: {
              conversationId,
              role: "ASSISTANT",
              content: answer,
              language,
              mode,
              kind: mode === "case" ? kind : null,
              evidenceLevel: isQuestion ? undefined : (finalEvidence as EvidenceLevel),
            },
            select: { id: true },
          });
          assistantMessageId = assistantMessage.id;

          // Persist the sources alongside the answer, skipped for a
          // clarifying question — it cited nothing. Without this a
          // reopened conversation would show the answer but none of
          // the legislation behind it.
          if (!isQuestion && chunks.length > 0) {
            await prisma.citation.createMany({
              data: chunks.map((c) => ({
                messageId: assistantMessage.id,
                legalSourceId: c.sourceId,
                section: c.section,
                snippet: c.text.slice(0, 2000),
              })),
              skipDuplicates: true,
            });
          }

          // Bump the thread so it sorts to the top of the history list.
          await prisma.conversation.update({
            where: { id: conversationId },
            data: { updatedAt: new Date() },
          });
        } catch (persistErr) {
          logger.warn("Chat persistence skipped", {
            errorType: String(persistErr),
          });
        }

        send("done", {
          citations: isQuestion ? [] : chunks,
          evidenceLevel: finalEvidence,
          citationWarning,
          unverifiedCitations: audit.unverified,
          // Sent so the UI can show a positive trust signal
          // ("3 of 3 citations verified"), not just warnings.
          verifiedCitations: audit.verified,
          isDemo: provider.isDemo,
          conversationId,
          userMessageId,
          assistantMessageId,
          kind,
          mode,
          questionsAskedSoFar: intake.askedQuestions.length + (isQuestion ? 1 : 0),
        });

        // ---- Remember ----
        // Deliberately AFTER the answer has been sent: recording what is
        // worth carrying forward must never make the user wait for their
        // reply. Small talk is skipped — "hi" contains nothing durable.
        if (!smallTalk && answer.trim().length > 40) {
          void extractMemories(userId, content, answer, conversationId).catch(() => {
            // Already logged inside; memory must never surface as an error.
          });
        }

        logger.info("Streamed chat completed", {
          userId,
          mode,
          kind,
          retrievalLatencyMs,
          totalLatencyMs: Date.now() - startedAt,
          evidenceLevel,
          sourceCount: chunks.length,
        });
      } catch (err) {
        logger.error("Streamed chat failed", {
          userId,
          errorType: String(err),
        });
        
        // Awaited, not fire-and-forget: the `finally` below closes the
        // stream synchronously, so a `.then()` here resolved only after
        // the controller was already closed and the error was silently
        // dropped — every failed generation reached the user as an empty
        // reply with no explanation.
        let payload = {
          code: "UNKNOWN_ERROR",
          message: "Could not generate a response right now. Please try again in a moment.",
        };
        try {
          const { getSanitizedErrorMessage } = await import("@/lib/ai/errors");
          payload = getSanitizedErrorMessage(err);
        } catch {
          /* keep the generic message */
        }
        send("error", payload);
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          /* the client already disconnected */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Stops proxies buffering the stream, which would defeat the point.
      "X-Accel-Buffering": "no",
    },
  });
}
