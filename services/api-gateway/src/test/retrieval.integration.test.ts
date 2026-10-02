import mongoose from "mongoose";
import KnowledgeChunk from "../models/KnowledgeChunk";
import { retrieveRelevantChunks } from "../rag/retrieval";

const TEST_MONGO_URI =
  process.env.RAG_TEST_MONGO_URI ||
  "mongodb://127.0.0.1:27017/stocksync-rag-test";

describe("retrieveRelevantChunks integration", () => {
  beforeAll(async () => {
    await mongoose.connect(TEST_MONGO_URI);

    await KnowledgeChunk.deleteMany({});

    await KnowledgeChunk.insertMany([
      {
        tenantId: "tenant-acme",
        source: "acme/test.md",
        chunkIndex: 0,
        text: "Acme tenant knowledge",
        chunkId: "integration-acme-1",
        embedding: [1, 0, 0],
      },
      {
        tenantId: "shared",
        source: "shared/test.md",
        chunkIndex: 0,
        text: "Shared knowledge",
        chunkId: "integration-shared-1",
        embedding: [0.8, 0.6, 0],
      },
      {
        tenantId: "tenant-beta",
        source: "beta/test.md",
        chunkIndex: 0,
        text: "Beta tenant knowledge",
        chunkId: "integration-beta-1",
        embedding: [0, 1, 0],
      },
    ]);
  });

  afterAll(async () => {
    await KnowledgeChunk.deleteMany({
      chunkId: {
        $in: [
          "integration-acme-1",
          "integration-shared-1",
          "integration-beta-1",
        ],
      },
    });
    await mongoose.disconnect();
  });

  it("Acme tenant isolation: returns Acme and Shared chunks, excludes Beta", async () => {
    const results = await retrieveRelevantChunks("tenant-acme", [1, 0, 0], 10);

    const chunkIds = results.map((r) => r.chunkId);
    expect(chunkIds).toContain("integration-acme-1");
    expect(chunkIds).toContain("integration-shared-1");
    expect(chunkIds).not.toContain("integration-beta-1");
  });

  it("Beta tenant isolation: returns Beta and Shared chunks, excludes Acme", async () => {
    const results = await retrieveRelevantChunks("tenant-beta", [0, 1, 0], 10);

    const chunkIds = results.map((r) => r.chunkId);
    expect(chunkIds).toContain("integration-beta-1");
    expect(chunkIds).toContain("integration-shared-1");
    expect(chunkIds).not.toContain("integration-acme-1");
  });

  it("highest-similarity cross-tenant isolation: excludes Beta even with perfect score", async () => {
    const results = await retrieveRelevantChunks("tenant-acme", [0, 1, 0], 10);

    const chunkIds = results.map((r) => r.chunkId);
    expect(chunkIds).not.toContain("integration-beta-1");
    expect(chunkIds).toContain("integration-acme-1");
    expect(chunkIds).toContain("integration-shared-1");
  });

  it("score ordering: Acme appears before Shared for [1,0,0] query", async () => {
    const results = await retrieveRelevantChunks("tenant-acme", [1, 0, 0], 10);

    const acme = results.find((r) => r.chunkId === "integration-acme-1");
    const shared = results.find((r) => r.chunkId === "integration-shared-1");

    expect(acme).toBeDefined();
    expect(shared).toBeDefined();
    expect(acme!.score).toBeCloseTo(1, 5);
    expect(shared!.score).toBeCloseTo(0.8, 5);
    expect(results[0].chunkId).toBe("integration-acme-1");
    expect(results[1].chunkId).toBe("integration-shared-1");
  });
});
