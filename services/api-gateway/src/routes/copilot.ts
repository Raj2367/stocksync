import { Router } from "express";
import { authenticateToken, AuthRequest } from "../middleware/auth";
import { buildCopilotPrompt } from "../rag/copilotPrompt";
import { generateText } from "../rag/geminiLlm";
import { fetchLiveOrderFacts, LiveOrderFacts } from "../rag/liveFacts";

const router = Router();

const GEMINI_TIMEOUT_MS = 15000;

class TimeoutError extends Error {}

function getProviderStatus(error: unknown): number | undefined {
  if (error && typeof error === "object") {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number" && Number.isInteger(status)) {
      return status;
    }
    const code = (error as { code?: unknown }).code;
    if (typeof code === "number" && Number.isInteger(code)) {
      return code;
    }
  }
  return undefined;
}

router.post("/ask", authenticateToken, async (req: AuthRequest, res) => {
  const body = req.body;

  if (!body || typeof body !== "object" || typeof body.question !== "string") {
    res.status(400).json({ error: "question must be a string" });
    return;
  }

  const question = body.question;

  if (question.trim().length === 0) {
    res.status(400).json({ error: "question must not be empty" });
    return;
  }

  const orderId = body.orderId;

  if (orderId !== undefined) {
    if (typeof orderId !== "string") {
      res.status(400).json({ error: "orderId must be a string" });
      return;
    }
    if (orderId.trim().length === 0) {
      res.status(400).json({ error: "orderId must not be empty" });
      return;
    }
  }

  const tenantId = req.user!.tenantId;

  let liveOrderFacts: LiveOrderFacts | undefined;

  if (orderId !== undefined) {
    try {
      liveOrderFacts = await fetchLiveOrderFacts(tenantId, orderId);
    } catch {
      res.status(500).json({ error: "Failed to fetch live order facts" });
      return;
    }
  }

  let promptAndChunks;
  try {
    if (liveOrderFacts !== undefined) {
      promptAndChunks = await buildCopilotPrompt({
        tenantId,
        question,
        liveOrderFacts,
      });
    } else {
      promptAndChunks = await buildCopilotPrompt({
        tenantId,
        question,
      });
    }
  } catch {
    res.status(500).json({ error: "Failed to prepare copilot request" });
    return;
  }

  const { prompt, retrievedChunks } = promptAndChunks;

  let timer: NodeJS.Timeout | undefined;

  try {
    const answer = await Promise.race([
      generateText(prompt),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new TimeoutError()),
          GEMINI_TIMEOUT_MS,
        );
      }),
    ]);

    const sources = retrievedChunks.map((chunk) => ({
      source: chunk.source,
      chunkIndex: chunk.chunkIndex,
      score: chunk.score,
    }));

    const liveFactsUsed = liveOrderFacts
      ? {
          order: liveOrderFacts.order.kind === "found",
          saga: liveOrderFacts.saga.kind === "found",
        }
      : { order: false, saga: false };

    res.status(200).json({ answer, sources, liveFactsUsed });
  } catch (error) {
    if (error instanceof TimeoutError) {
      res.status(504).json({ error: "Copilot generation timed out" });
      return;
    }

    const status = getProviderStatus(error);
    if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
      res.status(503).json({ error: "Copilot service temporarily unavailable" });
      return;
    }

    res.status(500).json({ error: "Failed to generate copilot response" });
    return;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
});

export { router as copilotRouter };
