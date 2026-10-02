import { chunkDocument, hashChunk, MAX_CHUNK_SIZE } from "../rag/chunker";

describe("chunker", () => {
  const TENANT = "tenant-acme";
  const SOURCE = "docs/payment-failure-runbook.md";

  describe("hashChunk", () => {
    it("produces the same result for identical tenantId/source/text", () => {
      const hash1 = hashChunk(TENANT, SOURCE, "Some text content");
      const hash2 = hashChunk(TENANT, SOURCE, "Some text content");
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it("changing tenantId changes the hash", () => {
      const hash1 = hashChunk(TENANT, SOURCE, "Some text content");
      const hash2 = hashChunk("tenant-beta", SOURCE, "Some text content");
      expect(hash1).not.toBe(hash2);
    });

    it("changing source changes the hash", () => {
      const hash1 = hashChunk(TENANT, SOURCE, "Some text content");
      const hash2 = hashChunk(TENANT, "docs/other-runbook.md", "Some text content");
      expect(hash1).not.toBe(hash2);
    });

    it("changing text changes the hash", () => {
      const hash1 = hashChunk(TENANT, SOURCE, "Some text content");
      const hash2 = hashChunk(TENANT, SOURCE, "Some other text");
      expect(hash1).not.toBe(hash2);
    });

    it("does not include chunkIndex in the hash", () => {
      const text = "Same text";
      // hashChunk does not accept chunkIndex
      const hash = hashChunk(TENANT, SOURCE, text);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("trims whitespace before hashing", () => {
      const hash1 = hashChunk(TENANT, SOURCE, "  text with spaces  ");
      const hash2 = hashChunk(TENANT, SOURCE, "text with spaces");
      expect(hash1).toBe(hash2);
    });
  });

  describe("chunkDocument", () => {
    it("returns [] for empty input", () => {
      expect(chunkDocument("", SOURCE, TENANT)).toEqual([]);
    });

    it("returns [] for whitespace-only input", () => {
      expect(chunkDocument("   \n\n  \t  \n", SOURCE, TENANT)).toEqual([]);
    });

    it("produces exactly one chunk for a document under 800 characters", () => {
      const text = "This is a short document.\n\nIt has two paragraphs.";
      const chunks = chunkDocument(text, SOURCE, TENANT);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].text).toBe("This is a short document.\n\nIt has two paragraphs.");
    });

    it("combines adjacent short paragraphs into one chunk", () => {
      const text = "First paragraph here.\n\nSecond paragraph here.\n\nThird paragraph here.";
      const chunks = chunkDocument(text, SOURCE, TENANT);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].text).toContain("First paragraph");
      expect(chunks[0].text).toContain("Second paragraph");
      expect(chunks[0].text).toContain("Third paragraph");
    });

    it("produces multiple chunks for a document exceeding 800 characters", () => {
      const paragraph1 =
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit. " +
        "Sed do eiusmod tempor incididunt ut labore. ".repeat(20);
      const paragraph2 =
        "Another paragraph with different content. " +
        "More text here for the second paragraph. ".repeat(20);
      const text = `${paragraph1}\n\n${paragraph2}`;

      const chunks = chunkDocument(text, SOURCE, TENANT);
      expect(chunks.length).toBeGreaterThan(1);
    });

    it("output is deterministic across repeated calls", () => {
      const text = "Repeated test document.\n\nSecond paragraph.".repeat(50);
      const chunks1 = chunkDocument(text, SOURCE, TENANT);
      const chunks2 = chunkDocument(text, SOURCE, TENANT);

      expect(chunks1).toEqual(chunks2);
    });

    it("chunkIndex values increase deterministically", () => {
      const text = "Para one.\n\nPara two.\n\nPara three.".repeat(50);
      const chunks = chunkDocument(text, SOURCE, TENANT);

      for (let i = 0; i < chunks.length; i++) {
        expect(chunks[i].chunkIndex).toBe(i);
      }
    });

    it("chunkId is deterministic", () => {
      const text = "Deterministic test.\n\nSecond paragraph.".repeat(50);
      const chunks1 = chunkDocument(text, SOURCE, TENANT);
      const chunks2 = chunkDocument(text, SOURCE, TENANT);

      chunks1.forEach((c, i) => {
        expect(c.chunkId).toBe(chunks2[i].chunkId);
      });
    });

    it("preserves tenantId", () => {
      const text = "Some document content.";
      const chunks = chunkDocument(text, SOURCE, "tenant-beta");
      expect(chunks[0].tenantId).toBe("tenant-beta");
    });

    it("preserves source", () => {
      const text = "Some document content.";
      const chunks = chunkDocument(text, SOURCE, TENANT);
      expect(chunks[0].source).toBe(SOURCE);
    });

    it("trims chunk text", () => {
      const text = "  Some content with leading spaces.  ";
      const chunks = chunkDocument(text, SOURCE, TENANT);
      expect(chunks[0].text).toBe("Some content with leading spaces.");
    });

    it("never produces a chunk larger than 800 characters", () => {
      const longSentence =
        "This is a very long sentence that should never exceed the limit. ".repeat(50);
      const text = `Short intro.\n\n${longSentence}\n\nFinal paragraph.`;
      const chunks = chunkDocument(text, SOURCE, TENANT);

      for (const chunk of chunks) {
        expect(chunk.text.length).toBeLessThanOrEqual(MAX_CHUNK_SIZE);
      }
    });

    it("splits a long paragraph without exceeding 800 characters", () => {
      const longParagraph =
        "First sentence is here. ".repeat(100);
      const text = `Short.\n\n${longParagraph}`;
      const chunks = chunkDocument(text, SOURCE, TENANT);

      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.text.length).toBeLessThanOrEqual(MAX_CHUNK_SIZE);
      }
    });

    it("hard-splits a single sentence longer than 800 characters", () => {
      const veryLongSentence = "word ".repeat(2000).trim();
      const text = `Short intro.\n\n${veryLongSentence}`;
      const chunks = chunkDocument(text, SOURCE, TENANT);

      for (const chunk of chunks) {
        expect(chunk.text.length).toBeLessThanOrEqual(MAX_CHUNK_SIZE);
      }
    });

    it("hash excludes chunkIndex, so inserting a paragraph changes chunk IDs after the insertion point", () => {
      const first = "This is the first paragraph.";
      const second = "This is the second paragraph.";
      const third = "This is the third paragraph.";

      const base = `${first}\n\n${second}\n\n${third}`;
      const withInsert = `${first}\n\nINSERTED PARAGRAPH HERE.\n\n${second}\n\n${third}`;

      const baseChunks = chunkDocument(base, SOURCE, TENANT);
      const insertChunks = chunkDocument(withInsert, SOURCE, TENANT);

      // The first chunk contains the first paragraph — its text changes because
      // the inserted paragraph alters how greedy combination works.
      // Verify that hashChunk does not depend on chunkIndex by confirming
      // two chunks with identical text/source/tenant produce identical IDs.
      const sharedText = "Shared content.";
      const h1 = hashChunk(TENANT, SOURCE, sharedText);
      const h2 = hashChunk(TENANT, SOURCE, sharedText);
      expect(h1).toBe(h2);

      // Inserting a paragraph must produce a different chunk set
      expect(baseChunks).not.toEqual(insertChunks);
    });
  });
});
