import express, { Express } from "express";
import request from "supertest";
import { copilotRouter } from "../routes/copilot";

jest.mock("../middleware/auth", () => ({
  authenticateToken: jest.fn(),
}));

jest.mock("../rag/copilotPrompt", () => ({
  buildCopilotPrompt: jest.fn(),
}));

jest.mock("../rag/geminiLlm", () => ({
  generateText: jest.fn(),
}));

jest.mock("../rag/liveFacts", () => ({
  fetchLiveOrderFacts: jest.fn(),
}));

jest.mock("../middleware/copilotRateLimiter", () => ({
  copilotRateLimiter: (_req: any, _res: any, next: any) => next(),
}));

import { authenticateToken } from "../middleware/auth";
import { buildCopilotPrompt } from "../rag/copilotPrompt";
import { generateText } from "../rag/geminiLlm";
import { fetchLiveOrderFacts } from "../rag/liveFacts";

const mockAuthenticateToken = authenticateToken as jest.MockedFunction<typeof authenticateToken>;
const mockBuildCopilotPrompt = buildCopilotPrompt as jest.MockedFunction<typeof buildCopilotPrompt>;
const mockGenerateText = generateText as jest.MockedFunction<typeof generateText>;
const mockFetchLiveOrderFacts = fetchLiveOrderFacts as jest.MockedFunction<typeof fetchLiveOrderFacts>;

function createTestApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/copilot", copilotRouter);
  return app;
}

describe("POST /copilot/ask", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockAuthenticateToken.mockImplementation((_req: any, _res: any, next: any) => {
      _req.user = {
        userId: "u1",
        tenantId: "tenant-acme",
        role: "USER",
        email: "user@acme.example",
      };
      next();
    });

    mockFetchLiveOrderFacts.mockResolvedValue({
      order: { kind: "not_found" },
      saga: { kind: "not_found" },
    });
  });

  it("valid authenticated request returns 200", async () => {
    mockBuildCopilotPrompt.mockResolvedValue({
      prompt: "test prompt",
      retrievedChunks: [],
    });
    mockGenerateText.mockResolvedValue("The answer is 42.");

    const app = createTestApp();

    const res = await request(app)
      .post("/copilot/ask")
      .send({ question: "How do I handle a failed payment?" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("answer");
    expect(res.body).toHaveProperty("sources");
  });

  it("tenant comes from req.user.tenantId", async () => {
    mockBuildCopilotPrompt.mockResolvedValue({
      prompt: "test prompt",
      retrievedChunks: [],
    });
    mockGenerateText.mockResolvedValue("answer");

    const app = createTestApp();

    await request(app)
      .post("/copilot/ask")
      .send({ question: "test" });

    expect(mockBuildCopilotPrompt).toHaveBeenCalledWith({
      tenantId: "tenant-acme",
      question: "test",
    });
  });

  it("body tenantId cannot override JWT tenant", async () => {
    mockBuildCopilotPrompt.mockResolvedValue({
      prompt: "test prompt",
      retrievedChunks: [],
    });
    mockGenerateText.mockResolvedValue("answer");

    const app = createTestApp();

    await request(app)
      .post("/copilot/ask")
      .send({
        tenantId: "tenant-beta",
        question: "test question",
      });

    expect(mockBuildCopilotPrompt).toHaveBeenCalledWith({
      tenantId: "tenant-acme",
      question: "test question",
    });
    expect(mockBuildCopilotPrompt.mock.calls[0][0].tenantId).toBe("tenant-acme");
  });

  it("missing body returns 400", async () => {
    const app = createTestApp();

    const res = await request(app)
      .post("/copilot/ask")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "question must be a string" });
    expect(mockBuildCopilotPrompt).not.toHaveBeenCalled();
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("non-string question returns 400", async () => {
    const app = createTestApp();

    const res = await request(app)
      .post("/copilot/ask")
      .send({ question: 123 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "question must be a string" });
    expect(mockBuildCopilotPrompt).not.toHaveBeenCalled();
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("empty-string question returns 400", async () => {
    const app = createTestApp();

    const res = await request(app)
      .post("/copilot/ask")
      .send({ question: "" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "question must not be empty" });
    expect(mockBuildCopilotPrompt).not.toHaveBeenCalled();
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("whitespace-only question returns 400", async () => {
    const app = createTestApp();

    const res = await request(app)
      .post("/copilot/ask")
      .send({ question: "   " });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "question must not be empty" });
    expect(mockBuildCopilotPrompt).not.toHaveBeenCalled();
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("buildCopilotPrompt() is called before generateText()", async () => {
    mockBuildCopilotPrompt.mockResolvedValue({
      prompt: "test prompt",
      retrievedChunks: [],
    });
    mockGenerateText.mockResolvedValue("answer");

    const app = createTestApp();

    await request(app)
      .post("/copilot/ask")
      .send({ question: "test" });

    expect(mockBuildCopilotPrompt.mock.invocationCallOrder[0]).toBeLessThan(
      mockGenerateText.mock.invocationCallOrder[0],
    );
  });

  it("generateText() receives exactly the prompt returned by buildCopilotPrompt()", async () => {
    const expectedPrompt = "constructed prompt string";
    mockBuildCopilotPrompt.mockResolvedValue({
      prompt: expectedPrompt,
      retrievedChunks: [],
    });
    mockGenerateText.mockResolvedValue("answer");

    const app = createTestApp();

    await request(app)
      .post("/copilot/ask")
      .send({ question: "test" });

    expect(mockGenerateText).toHaveBeenCalledWith(expectedPrompt);
  });

  it("sources contain only source, chunkIndex, score", async () => {
    mockBuildCopilotPrompt.mockResolvedValue({
      prompt: "prompt",
      retrievedChunks: [
        {
          tenantId: "tenant-acme",
          source: "acme/doc.md",
          chunkIndex: 0,
          text: "chunk text",
          chunkId: "chunk-1",
          score: 0.82,
        },
      ],
    });
    mockGenerateText.mockResolvedValue("answer");

    const app = createTestApp();

    const res = await request(app)
      .post("/copilot/ask")
      .send({ question: "test" });

    expect(res.status).toBe(200);
    const source = res.body.sources[0];
    const keys = Object.keys(source).sort();
    expect(keys).toEqual(["chunkIndex", "score", "source"].sort());
    expect(source).not.toHaveProperty("text");
    expect(source).not.toHaveProperty("embedding");
    expect(source).not.toHaveProperty("tenantId");
    expect(source).not.toHaveProperty("chunkId");
  });

  it("sources preserve retrieved-chunk order", async () => {
    mockBuildCopilotPrompt.mockResolvedValue({
      prompt: "prompt",
      retrievedChunks: [
        {
          tenantId: "tenant-acme",
          source: "acme/first.md",
          chunkIndex: 0,
          text: "first",
          chunkId: "1",
          score: 0.95,
        },
        {
          tenantId: "tenant-acme",
          source: "acme/second.md",
          chunkIndex: 1,
          text: "second",
          chunkId: "2",
          score: 0.85,
        },
      ],
    });
    mockGenerateText.mockResolvedValue("answer");

    const app = createTestApp();

    const res = await request(app)
      .post("/copilot/ask")
      .send({ question: "test" });

    expect(res.body.sources).toHaveLength(2);
    expect(res.body.sources[0].source).toBe("acme/first.md");
    expect(res.body.sources[1].source).toBe("acme/second.md");
  });

  it("chunk text is NOT returned in the HTTP response", async () => {
    mockBuildCopilotPrompt.mockResolvedValue({
      prompt: "prompt",
      retrievedChunks: [
        {
          tenantId: "tenant-acme",
          source: "acme/doc.md",
          chunkIndex: 0,
          text: "SECRET_CHUNK_TEXT",
          chunkId: "chunk-1",
          score: 0.82,
        },
      ],
    });
    mockGenerateText.mockResolvedValue("answer");

    const app = createTestApp();

    const res = await request(app)
      .post("/copilot/ask")
      .send({ question: "test" });

    expect(JSON.stringify(res.body)).not.toContain("SECRET_CHUNK_TEXT");
  });

  it("embedding is NOT returned in the HTTP response", async () => {
    mockBuildCopilotPrompt.mockResolvedValue({
      prompt: "prompt",
      retrievedChunks: [
        {
          tenantId: "tenant-acme",
          source: "acme/doc.md",
          chunkIndex: 0,
          text: "text",
          chunkId: "chunk-1",
          score: 0.82,
        },
      ],
    });
    mockGenerateText.mockResolvedValue("answer");

    const app = createTestApp();

    const res = await request(app)
      .post("/copilot/ask")
      .send({ question: "test" });

    expect(res.body).not.toHaveProperty("embedding");
    expect(JSON.stringify(res.body)).not.toContain("embedding");
    expect(JSON.stringify(res.body)).not.toContain("[0.");
  });

  it("tenantId is NOT returned in each source", async () => {
    mockBuildCopilotPrompt.mockResolvedValue({
      prompt: "prompt",
      retrievedChunks: [
        {
          tenantId: "tenant-acme",
          source: "acme/doc.md",
          chunkIndex: 0,
          text: "text",
          chunkId: "chunk-1",
          score: 0.82,
        },
      ],
    });
    mockGenerateText.mockResolvedValue("answer");

    const app = createTestApp();

    const res = await request(app)
      .post("/copilot/ask")
      .send({ question: "test" });

    const source = res.body.sources[0];
    expect(source).not.toHaveProperty("tenantId");
  });

  it("chunkId is NOT returned in each source", async () => {
    mockBuildCopilotPrompt.mockResolvedValue({
      prompt: "prompt",
      retrievedChunks: [
        {
          tenantId: "tenant-acme",
          source: "acme/doc.md",
          chunkIndex: 0,
          text: "text",
          chunkId: "secret-chunk-id",
          score: 0.82,
        },
      ],
    });
    mockGenerateText.mockResolvedValue("answer");

    const app = createTestApp();

    const res = await request(app)
      .post("/copilot/ask")
      .send({ question: "test" });

    const source = res.body.sources[0];
    expect(source).not.toHaveProperty("chunkId");
    expect(JSON.stringify(res.body)).not.toContain("secret-chunk-id");
  });

  it("Gemini 429 returns 503", async () => {
    mockBuildCopilotPrompt.mockResolvedValue({
      prompt: "prompt",
      retrievedChunks: [],
    });

    const err429 = Object.assign(new Error("rate limited"), { status: 429 });
    mockGenerateText.mockRejectedValue(err429);

    const app = createTestApp();

    const res = await request(app)
      .post("/copilot/ask")
      .send({ question: "test" });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "Copilot service temporarily unavailable" });
  });

  it("Gemini 500 returns 503", async () => {
    mockBuildCopilotPrompt.mockResolvedValue({
      prompt: "prompt",
      retrievedChunks: [],
    });

    const err500 = Object.assign(new Error("server error"), { status: 500 });
    mockGenerateText.mockRejectedValue(err500);

    const app = createTestApp();

    const res = await request(app)
      .post("/copilot/ask")
      .send({ question: "test" });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "Copilot service temporarily unavailable" });
  });

  it("Gemini 502 returns 503", async () => {
    mockBuildCopilotPrompt.mockResolvedValue({
      prompt: "prompt",
      retrievedChunks: [],
    });

    const err502 = Object.assign(new Error("bad gateway"), { status: 502 });
    mockGenerateText.mockRejectedValue(err502);

    const app = createTestApp();

    const res = await request(app)
      .post("/copilot/ask")
      .send({ question: "test" });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "Copilot service temporarily unavailable" });
  });

  it("Gemini 503 returns 503", async () => {
    mockBuildCopilotPrompt.mockResolvedValue({
      prompt: "prompt",
      retrievedChunks: [],
    });

    const err503 = Object.assign(new Error("service unavailable"), { status: 503 });
    mockGenerateText.mockRejectedValue(err503);

    const app = createTestApp();

    const res = await request(app)
      .post("/copilot/ask")
      .send({ question: "test" });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "Copilot service temporarily unavailable" });
  });

  it("Gemini 504 returns 503", async () => {
    mockBuildCopilotPrompt.mockResolvedValue({
      prompt: "prompt",
      retrievedChunks: [],
    });

    const err504 = Object.assign(new Error("gateway timeout"), { status: 504 });
    mockGenerateText.mockRejectedValue(err504);

    const app = createTestApp();

    const res = await request(app)
      .post("/copilot/ask")
      .send({ question: "test" });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "Copilot service temporarily unavailable" });
  });

  it("unexpected Gemini error returns 500", async () => {
    mockBuildCopilotPrompt.mockResolvedValue({
      prompt: "prompt",
      retrievedChunks: [],
    });

    const err = Object.assign(new Error("something weird"), { code: "ECONNRESET" });
    mockGenerateText.mockRejectedValue(err);

    const app = createTestApp();

    const res = await request(app)
      .post("/copilot/ask")
      .send({ question: "test" });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to generate copilot response" });
  });

  it("Gemini timeout returns 504 with 'Copilot generation timed out'", async () => {
    mockBuildCopilotPrompt.mockResolvedValue({
      prompt: "prompt",
      retrievedChunks: [],
    });

    mockGenerateText.mockImplementation(() => {
      return new Promise<string>(() => {
      });
    });

    const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");
    const setTimeoutSpy = jest
      .spyOn(global, "setTimeout")
      .mockImplementation((callback: () => void) => {
        process.nextTick(callback);
        return {} as unknown as NodeJS.Timeout;
      });

    const app = createTestApp();

    const res = await request(app)
      .post("/copilot/ask")
      .send({ question: "test" });

    expect(res.status).toBe(504);
    expect(res.body).toEqual({ error: "Copilot generation timed out" });
    expect(clearTimeoutSpy).toHaveBeenCalled();

    setTimeoutSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
  });

  it("timeout clears the timer on successful request", async () => {
    mockBuildCopilotPrompt.mockResolvedValue({
      prompt: "prompt",
      retrievedChunks: [],
    });
    mockGenerateText.mockResolvedValue("answer");

    const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");

    const app = createTestApp();

    const res = await request(app)
      .post("/copilot/ask")
      .send({ question: "test" });

    expect(res.status).toBe(200);
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it("cleartimer is called on provider rejection", async () => {
    mockBuildCopilotPrompt.mockResolvedValue({
      prompt: "prompt",
      retrievedChunks: [],
    });

    const err429 = Object.assign(new Error("rate limited"), { status: 429 });
    mockGenerateText.mockRejectedValue(err429);

    const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");

    const app = createTestApp();

    const res = await request(app)
      .post("/copilot/ask")
      .send({ question: "test" });

    expect(res.status).toBe(503);
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it("buildCopilotPrompt() rejection returns 500", async () => {
    mockBuildCopilotPrompt.mockRejectedValue(new Error("prompt build failed"));

    const app = createTestApp();

    const res = await request(app)
      .post("/copilot/ask")
      .send({ question: "test" });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to prepare copilot request" });
  });

  it("generateText() is not called when buildCopilotPrompt() rejects", async () => {
    mockBuildCopilotPrompt.mockRejectedValue(new Error("prompt build failed"));

    const app = createTestApp();

    await request(app)
      .post("/copilot/ask")
      .send({ question: "test" });

    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("unauthenticated request returns 401 and handler is not executed", async () => {
    mockAuthenticateToken.mockImplementation((_req: any, res: any, _next: any) => {
      res.status(401).json({ error: "Access token required" });
    });

    const app = createTestApp();

    const res = await request(app)
      .post("/copilot/ask")
      .send({ question: "test" });

    expect(res.status).toBe(401);
    expect(mockBuildCopilotPrompt).not.toHaveBeenCalled();
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("no prompt/API-key leakage occurs in HTTP error responses", async () => {
    mockBuildCopilotPrompt.mockResolvedValue({
      prompt: "SECRET_PROMPT_CONTENT_SHOULD_NOT_LEAK",
      retrievedChunks: [],
    });

    const err = Object.assign(new Error("rate limited"), { status: 429 });
    mockGenerateText.mockRejectedValue(err);

    const app = createTestApp();

    const res = await request(app)
      .post("/copilot/ask")
      .send({ question: "SECRET_QUESTION_SHOULD_NOT_LEAK" });

    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain("SECRET_PROMPT_CONTENT_SHOULD_NOT_LEAK");
    expect(JSON.stringify(res.body)).not.toContain("SECRET_QUESTION_SHOULD_NOT_LEAK");
    expect(JSON.stringify(res.body)).not.toContain("test-gemini-key");
  });

  it("no real Gemini/MongoDB/Redis/Kafka/Order/Saga network call occurs", async () => {
    mockBuildCopilotPrompt.mockResolvedValue({
      prompt: "prompt",
      retrievedChunks: [
        {
          tenantId: "tenant-acme",
          source: "acme/doc.md",
          chunkIndex: 0,
          text: "text",
          chunkId: "c1",
          score: 0.82,
        },
      ],
    });
    mockGenerateText.mockResolvedValue("answer");

    const app = createTestApp();

    const res = await request(app)
      .post("/copilot/ask")
      .send({ question: "test" });

    expect(res.status).toBe(200);
    expect(mockBuildCopilotPrompt).toHaveBeenCalledTimes(1);
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    expect(mockFetchLiveOrderFacts).not.toHaveBeenCalled();
  });

  it("valid request without orderId: fetchLiveOrderFacts not called, buildCopilotPrompt called exactly with { tenantId, question }", async () => {
    mockBuildCopilotPrompt.mockResolvedValue({
      prompt: "prompt",
      retrievedChunks: [],
    });
    mockGenerateText.mockResolvedValue("answer");

    const app = createTestApp();

    const res = await request(app)
      .post("/copilot/ask")
      .send({ question: "test" });

    expect(res.status).toBe(200);
    expect(mockFetchLiveOrderFacts).not.toHaveBeenCalled();
    expect(mockBuildCopilotPrompt).toHaveBeenCalledWith({
      tenantId: "tenant-acme",
      question: "test",
    });
    expect(res.body.liveFactsUsed).toEqual({ order: false, saga: false });
  });

  it("valid request with orderId fetches live facts and passes them to buildCopilotPrompt", async () => {
    const liveFacts = {
      order: { kind: "found" as const, data: { orderId: "ord-1" } },
      saga: { kind: "found" as const, data: { sagaId: "s-1" } },
    };
    mockFetchLiveOrderFacts.mockResolvedValue(liveFacts);
    mockBuildCopilotPrompt.mockResolvedValue({
      prompt: "prompt",
      retrievedChunks: [],
    });
    mockGenerateText.mockResolvedValue("answer");

    const app = createTestApp();

    const res = await request(app)
      .post("/copilot/ask")
      .send({ question: "test", orderId: "ord-1" });

    expect(res.status).toBe(200);
    expect(mockFetchLiveOrderFacts).toHaveBeenCalledWith("tenant-acme", "ord-1");
    expect(mockBuildCopilotPrompt).toHaveBeenCalledWith({
      tenantId: "tenant-acme",
      question: "test",
      liveOrderFacts: liveFacts,
    });
    expect(res.body.liveFactsUsed).toEqual({ order: true, saga: true });
  });

  it("order found, saga not_found: liveFactsUsed order true, saga false", async () => {
    mockFetchLiveOrderFacts.mockResolvedValue({
      order: { kind: "found", data: { orderId: "ord-1" } },
      saga: { kind: "not_found" },
    });
    mockBuildCopilotPrompt.mockResolvedValue({
      prompt: "prompt",
      retrievedChunks: [],
    });
    mockGenerateText.mockResolvedValue("answer");

    const app = createTestApp();

    const res = await request(app)
      .post("/copilot/ask")
      .send({ question: "test", orderId: "ord-1" });

    expect(res.status).toBe(200);
    expect(res.body.liveFactsUsed).toEqual({ order: true, saga: false });
  });

  it("order not_found, saga found: liveFactsUsed order false, saga true", async () => {
    mockFetchLiveOrderFacts.mockResolvedValue({
      order: { kind: "not_found" },
      saga: { kind: "found", data: { sagaId: "s-1" } },
    });
    mockBuildCopilotPrompt.mockResolvedValue({
      prompt: "prompt",
      retrievedChunks: [],
    });
    mockGenerateText.mockResolvedValue("answer");

    const app = createTestApp();

    const res = await request(app)
      .post("/copilot/ask")
      .send({ question: "test", orderId: "ord-1" });

    expect(res.status).toBe(200);
    expect(res.body.liveFactsUsed).toEqual({ order: false, saga: true });
  });

  it("both live facts not_found returns HTTP 200 (not 404)", async () => {
    mockFetchLiveOrderFacts.mockResolvedValue({
      order: { kind: "not_found" },
      saga: { kind: "not_found" },
    });
    mockBuildCopilotPrompt.mockResolvedValue({
      prompt: "prompt",
      retrievedChunks: [],
    });
    mockGenerateText.mockResolvedValue("answer");

    const app = createTestApp();

    const res = await request(app)
      .post("/copilot/ask")
      .send({ question: "test", orderId: "missing-1" });

    expect(res.status).toBe(200);
    expect(res.body.liveFactsUsed).toEqual({ order: false, saga: false });
  });

  it("one or both live facts unavailable returns HTTP 200 (not 503)", async () => {
    mockFetchLiveOrderFacts.mockResolvedValue({
      order: { kind: "unavailable" },
      saga: { kind: "found", data: { sagaId: "s-1" } },
    });
    mockBuildCopilotPrompt.mockResolvedValue({
      prompt: "prompt",
      retrievedChunks: [],
    });
    mockGenerateText.mockResolvedValue("answer");

    const app = createTestApp();

    const res = await request(app)
      .post("/copilot/ask")
      .send({ question: "test", orderId: "ord-1" });

    expect(res.status).toBe(200);
    expect(res.body.liveFactsUsed).toEqual({ order: false, saga: true });
  });

  it("orderId non-string returns 400 and does not call fetchLiveOrderFacts or buildCopilotPrompt", async () => {
    const app = createTestApp();

    const res = await request(app)
      .post("/copilot/ask")
      .send({ question: "test", orderId: 123 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "orderId must be a string" });
    expect(mockFetchLiveOrderFacts).not.toHaveBeenCalled();
    expect(mockBuildCopilotPrompt).not.toHaveBeenCalled();
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("orderId empty/whitespace returns 400 and does not call fetchLiveOrderFacts or buildCopilotPrompt", async () => {
    const app = createTestApp();

    const res = await request(app)
      .post("/copilot/ask")
      .send({ question: "test", orderId: "   " });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "orderId must not be empty" });
    expect(mockFetchLiveOrderFacts).not.toHaveBeenCalled();
    expect(mockBuildCopilotPrompt).not.toHaveBeenCalled();
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("tenant isolation: fetchLiveOrderFacts receives tenant from JWT, not from body", async () => {
    mockFetchLiveOrderFacts.mockResolvedValue({
      order: { kind: "not_found" },
      saga: { kind: "not_found" },
    });
    mockBuildCopilotPrompt.mockResolvedValue({
      prompt: "prompt",
      retrievedChunks: [],
    });
    mockGenerateText.mockResolvedValue("answer");

    mockAuthenticateToken.mockImplementationOnce((_req: any, _res: any, next: any) => {
      _req.user = {
        userId: "u2",
        tenantId: "tenant-beta",
        role: "USER",
        email: "user@beta.example",
      };
      next();
    });

    const app = createTestApp();

    await request(app)
      .post("/copilot/ask")
      .send({ question: "test", orderId: "ord-1" });

    expect(mockFetchLiveOrderFacts).toHaveBeenCalledWith("tenant-beta", "ord-1");
  });

  it("fetchLiveOrderFacts unexpectedly rejects returns 500 with generic error", async () => {
    mockFetchLiveOrderFacts.mockRejectedValue(new Error("unexpected failure"));

    const app = createTestApp();

    const res = await request(app)
      .post("/copilot/ask")
      .send({ question: "test", orderId: "ord-1" });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to fetch live order facts" });
  });

  it("live order data is not copied into sources", async () => {
    mockFetchLiveOrderFacts.mockResolvedValue({
      order: { kind: "found", data: { orderId: "ord-1", customerEmail: "leak@test.com" } },
      saga: { kind: "not_found" },
    });
    mockBuildCopilotPrompt.mockResolvedValue({
      prompt: "prompt",
      retrievedChunks: [
        {
          tenantId: "tenant-acme",
          source: "acme/doc.md",
          chunkIndex: 0,
          text: "chunk text",
          chunkId: "chunk-1",
          score: 0.82,
        },
      ],
    });
    mockGenerateText.mockResolvedValue("answer");

    const app = createTestApp();

    const res = await request(app)
      .post("/copilot/ask")
      .send({ question: "test", orderId: "ord-1" });

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body.sources)).not.toContain("leak@test.com");
  });
});
