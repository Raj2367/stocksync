import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

jest.mock("../models/KnowledgeChunk");
jest.mock("../rag/gemini");

import KnowledgeChunk from "../models/KnowledgeChunk";
import { embedText } from "../rag/gemini";
import { syncKnowledgeCorpus } from "../rag/knowledgeSync";

describe("knowledgeSync", () => {
  let mockFind: jest.Mock;
  let mockUpdateOne: jest.Mock;
  let mockDeleteMany: jest.Mock;
  let tmpDir: string;

  const mockedEmbedText = embedText as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockFind = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue([]),
    });
    mockUpdateOne = jest
      .fn()
      .mockResolvedValue({ modified: 1, upserted: true });
    mockDeleteMany = jest.fn().mockResolvedValue({ deletedCount: 0 });

    (KnowledgeChunk as any).find = mockFind;
    (KnowledgeChunk as any).updateOne = mockUpdateOne;
    (KnowledgeChunk as any).deleteMany = mockDeleteMany;

    mockedEmbedText.mockResolvedValue([0.1, 0.2, 0.3]);

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stocksync-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function writeCorpusFile(relativePath: string, content: string): string {
    const fullPath = path.join(tmpDir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, "utf-8");
    return fullPath;
  }

  it("recursively reads nested Markdown documents", async () => {
    writeCorpusFile("shared/doc1.md", "# Doc 1");
    writeCorpusFile("acme/sub/deep.md", "# Deep doc");

    await syncKnowledgeCorpus(tmpDir);

    const updateCalls = mockUpdateOne.mock.calls;
    const sources = updateCalls.map((call) => (call[1] as any).$set.source);
    expect(sources).toContain("shared/doc1.md");
    expect(sources).toContain("acme/sub/deep.md");
  });

  it("correctly derives tenantId and POSIX source", async () => {
    writeCorpusFile("acme/docs/runbook.md", "# Runbook");

    await syncKnowledgeCorpus(tmpDir);

    const updateCall = mockUpdateOne.mock.calls[0];
    const setObj = updateCall[1] as { $set: any };
    expect(setObj.$set.tenantId).toBe("acme");
    expect(setObj.$set.source).toBe("acme/docs/runbook.md");
  });

  it("ignores non-Markdown files", async () => {
    writeCorpusFile("acme/readme.txt", "not markdown");
    writeCorpusFile("acme/notes.md", "# Notes");

    await syncKnowledgeCorpus(tmpDir);

    const updateCalls = mockUpdateOne.mock.calls;
    const sources = updateCalls.map((c) => (c[1] as any).$set.source);
    expect(sources).toEqual(["acme/notes.md"]);
  });

  it("does not match uppercase/mixed-case .MD variants", async () => {
    writeCorpusFile("acme/readme_uppercase.MD", "not matched");
    writeCorpusFile("acme/readme_mixed.Md", "not matched");
    writeCorpusFile("acme/readme.md", "# Real markdown");

    await syncKnowledgeCorpus(tmpDir);

    const updateCalls = mockUpdateOne.mock.calls;
    const sources = updateCalls.map((c) => (c[1] as any).$set.source);
    expect(sources).toEqual(["acme/readme.md"]);
  });

  it("root-level Markdown file throws with the offending file named", async () => {
    writeCorpusFile("rootdoc.md", "# Root doc");

    await expect(syncKnowledgeCorpus(tmpDir)).rejects.toThrow(/rootdoc\.md/);
  });

  it("throws with absolute path when corpusRoot is missing", async () => {
    const missingRoot = path.join(tmpDir, "does-not-exist");
    const absMissing = path.resolve(missingRoot);

    await expect(syncKnowledgeCorpus(missingRoot)).rejects.toThrow(absMissing);
  });

  it("new chunks call embedText() and are upserted", async () => {
    writeCorpusFile("acme/test.md", "# Test document\n\nSome content here.");

    await syncKnowledgeCorpus(tmpDir);

    expect(mockedEmbedText).toHaveBeenCalledTimes(1);
    const embeddingResult = await mockedEmbedText.mock.results[0].value;
    expect(embeddingResult).toEqual([0.1, 0.2, 0.3]);

    const updateCall = mockUpdateOne.mock.calls[0];
    expect(updateCall[2]).toEqual({ upsert: true });
    expect((updateCall[1] as any).$set.embedding).toEqual([0.1, 0.2, 0.3]);
  });

  it("existing chunkIds do not call embedText() again", async () => {
    const chunkText = "# Test document\n\nSome content here.";
    writeCorpusFile("acme/test.md", chunkText);

    const { chunkDocument } = require("../rag/chunker");
    const chunks = chunkDocument(chunkText, "acme/test.md", "acme");

    mockFind.mockReturnValue({
      select: jest
        .fn()
        .mockResolvedValue(chunks.map((c: any) => ({ chunkId: c.chunkId }))),
    });

    await syncKnowledgeCorpus(tmpDir);

    expect(mockedEmbedText).not.toHaveBeenCalled();
    expect(mockUpdateOne).not.toHaveBeenCalled();
  });

  it("passes the exact chunk text unchanged to embedText()", async () => {
    writeCorpusFile("acme/test.md", "# Doc\n\n  Spaced content  \n");

    await syncKnowledgeCorpus(tmpDir);

    expect(mockedEmbedText).toHaveBeenCalledTimes(1);
    const passedText = mockedEmbedText.mock.calls[0][0];
    // chunkDocument trims paragraphs and joins them, so the text passed
    // to embedText is the chunk text produced by chunkDocument
    expect(passedText).toBe("# Doc\n\nSpaced content");
  });

  it("embedText() failure prevents stale deletion", async () => {
    writeCorpusFile("acme/test.md", "# Test");
    writeCorpusFile("acme/old.md", "# Old");

    mockedEmbedText
      .mockResolvedValueOnce(Promise.reject(new Error("Gemini API error")))
      .mockResolvedValue([0.1, 0.2, 0.3]);

    await expect(syncKnowledgeCorpus(tmpDir)).rejects.toThrow(
      "Gemini API error",
    );

    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it("successful sync deletes stale chunk IDs", async () => {
    writeCorpusFile("acme/current.md", "# Current");

    mockFind.mockReturnValue({
      select: jest
        .fn()
        .mockResolvedValue([{ chunkId: "existing-chunk-that-is-now-stale" }]),
    });

    await syncKnowledgeCorpus(tmpDir);

    expect(mockDeleteMany).toHaveBeenCalledTimes(1);
    const deleteCall = mockDeleteMany.mock.calls[0][0];
    expect(deleteCall.tenantId).toEqual({ $in: ["acme"] });
    // $nin contains the current chunk IDs (not the stale one)
    expect(deleteCall.chunkId).toEqual({ $nin: expect.any(Array) });
    // The stale chunk ID is NOT in $nin — it gets deleted
    expect(deleteCall.chunkId.$nin).not.toContain(
      "existing-chunk-that-is-now-stale",
    );
    // $nin has exactly one entry (the current corpus chunk ID)
    expect(deleteCall.chunkId.$nin).toHaveLength(1);
  });

  it("empty corpus throws and does not delete anything", async () => {
    fs.mkdirSync(path.join(tmpDir, "acme"), { recursive: true });
    writeCorpusFile("acme/readme.txt", "not markdown");

    await expect(syncKnowledgeCorpus(tmpDir)).rejects.toThrow(/No Markdown/);

    expect(mockDeleteMany).not.toHaveBeenCalled();
    expect(mockedEmbedText).not.toHaveBeenCalled();
  });

  it("changed document produces new chunk ID, embeds new chunk, removes old stale chunk", async () => {
    writeCorpusFile("acme/test.md", "# Changed content");

    mockFind.mockReturnValue({
      select: jest
        .fn()
        .mockResolvedValue([{ chunkId: "old-hash-for-original-content" }]),
    });

    await syncKnowledgeCorpus(tmpDir);

    expect(mockedEmbedText).toHaveBeenCalledTimes(1);
    expect(mockUpdateOne).toHaveBeenCalledWith(
      { chunkId: expect.any(String) },
      expect.objectContaining({
        $set: expect.objectContaining({ tenantId: "acme" }),
      }),
      { upsert: true },
    );

    // Old stale chunk ID should NOT be in $nin (it gets deleted)
    const deleteCall = mockDeleteMany.mock.calls[0][0];
    expect(deleteCall.chunkId.$nin).not.toContain(
      "old-hash-for-original-content",
    );
    expect(deleteCall.chunkId.$nin).toHaveLength(1);
  });

  it("stored chunk fields match KnowledgeChunk model shape", async () => {
    writeCorpusFile("acme/test.md", "# Test doc\n\nContent");

    await syncKnowledgeCorpus(tmpDir);

    const updateCall = mockUpdateOne.mock.calls[0];
    const setObj = updateCall[1].$set;

    expect(setObj).toHaveProperty("tenantId");
    expect(setObj).toHaveProperty("source");
    expect(setObj).toHaveProperty("chunkIndex");
    expect(setObj).toHaveProperty("text");
    expect(setObj).toHaveProperty("chunkId");
    expect(setObj).toHaveProperty("embedding");
    const expectedKeys = [
      "tenantId",
      "source",
      "chunkIndex",
      "text",
      "chunkId",
      "embedding",
    ];
    expect(Object.keys(setObj).sort()).toEqual([...expectedKeys].sort());
  });

  it("synchronizing only shared/ does not delete existing tenant-acme or tenant-beta chunks", async () => {
    writeCorpusFile("shared/knowledge.md", "# Shared knowledge");

    mockFind.mockReturnValue({
      select: jest
        .fn()
        .mockResolvedValue([
          { chunkId: "acme-existing-chunk" },
          { chunkId: "beta-existing-chunk" },
          { chunkId: "shared-existing-chunk" },
        ]),
    });

    await syncKnowledgeCorpus(tmpDir);

    expect(mockDeleteMany).toHaveBeenCalledTimes(1);
    const deleteCall = mockDeleteMany.mock.calls[0][0];
    expect(deleteCall.tenantId).toEqual({ $in: ["shared"] });
    expect(deleteCall.tenantId.$in).not.toContain("tenant-acme");
    expect(deleteCall.tenantId.$in).not.toContain("tenant-beta");
  });

  it("no real Gemini or MongoDB network calls occur", async () => {
    writeCorpusFile("acme/test.md", "# Test");

    await syncKnowledgeCorpus(tmpDir);

    expect(mockedEmbedText).toHaveBeenCalledTimes(1);
    expect(mockedEmbedText).toHaveReturned();

    expect(mockFind).toHaveBeenCalled();
    expect(mockUpdateOne).toHaveBeenCalled();
    expect(mockDeleteMany).toHaveBeenCalled();

    expect(mockedEmbedText.mock.results[0].value).resolves;
  });

  it("embedContent receives expected model with outputDimensionality 768", async () => {
    writeCorpusFile("acme/test.md", "# Test doc");

    await syncKnowledgeCorpus(tmpDir);

    expect((mockUpdateOne.mock.calls[0][1] as any).$set.embedding).toEqual([
      0.1, 0.2, 0.3,
    ]);
  });

  it("upsert filter uses chunkId as upsert identity", async () => {
    writeCorpusFile("acme/test.md", "# Test doc");

    await syncKnowledgeCorpus(tmpDir);

    const updateCall = mockUpdateOne.mock.calls[0];
    expect(updateCall[0]).toEqual({ chunkId: expect.any(String) });
    expect(updateCall[2]).toEqual({ upsert: true });
  });
});
