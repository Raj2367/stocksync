jest.mock("../models/KnowledgeChunk");

import { retrieveRelevantChunks, RetrievedChunk } from "../rag/retrieval";
import KnowledgeChunk from "../models/KnowledgeChunk";

const mockFind = jest.fn();

(KnowledgeChunk as any).find = mockFind;

describe("retrieval", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockFind.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    });
  });

  function setMockChunks(chunks: any[]): void {
    mockFind.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(chunks),
      }),
    });
  }

  it("tenant-specific chunks are queried together with shared chunks", async () => {
    setMockChunks([]);

    await retrieveRelevantChunks("tenant-acme", Array(768).fill(0.1));

    expect(mockFind).toHaveBeenCalledWith({
      tenantId: { $in: ["tenant-acme", "shared"] },
    });
  });

  it("another tenant is excluded by the Mongo query filter", async () => {
    setMockChunks([]);

    await retrieveRelevantChunks("tenant-beta", Array(768).fill(0.1));

    const findCall = mockFind.mock.calls[0][0];
    expect(findCall).toEqual({
      tenantId: { $in: ["tenant-beta", "shared"] },
    });
    expect(findCall.tenantId.$in).not.toContain("tenant-acme");
    expect(findCall.tenantId.$in).not.toContain("tenant-gamma");
  });

  it(".lean() is actually part of the query chain", async () => {
    const leanMock = jest.fn().mockResolvedValue([]);
    mockFind.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: leanMock,
      }),
    });

    await retrieveRelevantChunks("tenant-acme", Array(768).fill(0.1));

    expect(leanMock).toHaveBeenCalled();
  });

  it("select projects only required fields", async () => {
    const selectMock = jest.fn();
    const leanMock = jest.fn().mockResolvedValue([]);
    mockFind.mockReturnValue({
      select: selectMock.mockReturnValue({
        lean: leanMock,
      }),
    });

    await retrieveRelevantChunks("tenant-acme", Array(768).fill(0.1));

    expect(selectMock).toHaveBeenCalledWith(
      "tenantId source chunkIndex text chunkId embedding",
    );
  });

  it("returned objects contain ONLY the required fields (no _id, __v, embedding)", async () => {
    const queryEmbedding = Array(768).fill(1);
    setMockChunks([
      {
        _id: "mongo-id-1",
        __v: 0,
        tenantId: "tenant-acme",
        source: "acme/doc.md",
        chunkIndex: 0,
        text: "chunk text",
        chunkId: "abc123",
        embedding: Array(768).fill(1),
      },
    ]);

    const results = await retrieveRelevantChunks("tenant-acme", queryEmbedding);

    expect(results).toHaveLength(1);
    const result = results[0];
    const keys = Object.keys(result).sort();
    expect(keys).toEqual(
      ["chunkId", "chunkIndex", "score", "source", "text", "tenantId"].sort(),
    );
    expect(result).not.toHaveProperty("_id");
    expect(result).not.toHaveProperty("__v");
    expect(result).not.toHaveProperty("embedding");
  });

  it("cosine similarity is calculated correctly", async () => {
    const emb = Array(3).fill(1);
    setMockChunks([
      {
        tenantId: "tenant-acme",
        source: "acme/doc.md",
        chunkIndex: 0,
        text: "chunk",
        chunkId: "c1",
        embedding: emb,
      },
    ]);

    const results = await retrieveRelevantChunks("tenant-acme", emb);

    expect(results[0].score).toBeCloseTo(1, 5);
  });

  it("results are sorted in descending score order", async () => {
    const query = [1, 0, 0];
    setMockChunks([
      {
        tenantId: "tenant-acme",
        source: "acme/a.md",
        chunkIndex: 0,
        text: "orthogonal",
        chunkId: "c1",
        embedding: [0, 1, 0],
      },
      {
        tenantId: "tenant-acme",
        source: "acme/b.md",
        chunkIndex: 0,
        text: "identical",
        chunkId: "c2",
        embedding: [1, 0, 0],
      },
    ]);

    const results = await retrieveRelevantChunks("tenant-acme", query);

    expect(results[0].score).toBeCloseTo(1, 5);
    expect(results[1].score).toBeCloseTo(0, 5);
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
  });

  it("default topK is 5", async () => {
    const queryEmbedding = Array(3).fill(1);
    const chunks = [];
    for (let i = 0; i < 10; i++) {
      chunks.push({
        tenantId: "tenant-acme",
        source: `acme/doc${i}.md`,
        chunkIndex: i,
        text: `chunk ${i}`,
        chunkId: `chunk-${i}`,
        embedding: Array(3).fill(1),
      });
    }
    setMockChunks(chunks);

    const results = await retrieveRelevantChunks("tenant-acme", queryEmbedding);

    expect(results).toHaveLength(5);
  });

  it("explicit topK is respected", async () => {
    const queryEmbedding = Array(3).fill(1);
    const chunks = [];
    for (let i = 0; i < 10; i++) {
      chunks.push({
        tenantId: "tenant-acme",
        source: `acme/doc${i}.md`,
        chunkIndex: i,
        text: `chunk ${i}`,
        chunkId: `chunk-${i}`,
        embedding: Array(3).fill(1),
      });
    }
    setMockChunks(chunks);

    const results = await retrieveRelevantChunks("tenant-acme", queryEmbedding, 3);

    expect(results).toHaveLength(3);
  });

  it("zero-magnitude vectors return score 0 without NaN/Infinity", async () => {
    setMockChunks([
      {
        tenantId: "tenant-acme",
        source: "acme/doc.md",
        chunkIndex: 0,
        text: "chunk",
        chunkId: "c1",
        embedding: [0, 0, 0],
      },
    ]);

    const results = await retrieveRelevantChunks("tenant-acme", [0, 0, 0]);

    expect(results[0].score).toBe(0);
    expect(Number.isNaN(results[0].score)).toBe(false);
    expect(Number.isFinite(results[0].score)).toBe(true);
  });

  it("empty queryEmbedding [] returns score 0 without NaN/Infinity", async () => {
    setMockChunks([
      {
        tenantId: "tenant-acme",
        source: "acme/doc.md",
        chunkIndex: 0,
        text: "chunk",
        chunkId: "c1",
        embedding: [1, 2, 3],
      },
    ]);

    const results = await retrieveRelevantChunks("tenant-acme", []);

    expect(results[0].score).toBe(0);
    expect(Number.isNaN(results[0].score)).toBe(false);
    expect(Number.isFinite(results[0].score)).toBe(true);
  });

  it("mismatched vector dimensions throw a clear error containing both dimensions", async () => {
    setMockChunks([
      {
        tenantId: "tenant-acme",
        source: "acme/doc.md",
        chunkIndex: 0,
        text: "chunk",
        chunkId: "c1",
        embedding: Array(100).fill(0.5),
      },
    ]);

    await expect(
      retrieveRelevantChunks("tenant-acme", Array(768).fill(0.1)),
    ).rejects.toThrow(/768.*100|100.*768/);
  });

  it("returned objects contain ONLY required fields", async () => {
    const queryEmbedding = [1, 0, 0];
    setMockChunks([
      {
        tenantId: "tenant-acme",
        source: "acme/doc.md",
        chunkIndex: 0,
        text: "chunk text",
        chunkId: "abc123",
        embedding: [1, 0, 0],
      },
    ]);

    const results = await retrieveRelevantChunks("tenant-acme", queryEmbedding);

    expect(results).toHaveLength(1);
    const result = results[0];
    expect(result).toEqual({
      tenantId: "tenant-acme",
      source: "acme/doc.md",
      chunkIndex: 0,
      text: "chunk text",
      chunkId: "abc123",
      score: 1,
    });
  });

  it("empty candidate set returns []", async () => {
    setMockChunks([]);

    const results = await retrieveRelevantChunks("tenant-acme", Array(768).fill(0.1));

    expect(results).toEqual([]);
  });

  it("no real MongoDB/network call occurs", async () => {
    setMockChunks([
      {
        tenantId: "tenant-acme",
        source: "acme/doc.md",
        chunkIndex: 0,
        text: "chunk",
        chunkId: "c1",
        embedding: Array(3).fill(1),
      },
    ]);

    await retrieveRelevantChunks("tenant-acme", Array(3).fill(1));

    expect(mockFind).toHaveBeenCalledTimes(1);
    const selectMock = mockFind.mock.results[0].value.select;
    expect(selectMock).toHaveBeenCalledTimes(1);
    const leanMock = selectMock.mock.results[0].value.lean;
    expect(leanMock).toHaveBeenCalledTimes(1);
  });
});
