import { KnowledgeChunkSchema } from "../models/KnowledgeChunk";

describe("KnowledgeChunkSchema", () => {
  const schema = KnowledgeChunkSchema;

  describe("fields", () => {
    it("has tenantId field", () => {
      expect(schema.path("tenantId")).toBeDefined();
    });

    it("tenantId is required", () => {
      expect(schema.path("tenantId").isRequired).toBe(true);
    });

    it("has source field", () => {
      expect(schema.path("source")).toBeDefined();
    });

    it("source is required", () => {
      expect(schema.path("source").isRequired).toBe(true);
    });

    it("has chunkIndex field", () => {
      expect(schema.path("chunkIndex")).toBeDefined();
    });

    it("chunkIndex is required", () => {
      expect(schema.path("chunkIndex").isRequired).toBe(true);
    });

    it("has text field", () => {
      expect(schema.path("text")).toBeDefined();
    });

    it("text is required", () => {
      expect(schema.path("text").isRequired).toBe(true);
    });

    it("has chunkId field", () => {
      expect(schema.path("chunkId")).toBeDefined();
    });

    it("chunkId is required", () => {
      expect(schema.path("chunkId").isRequired).toBe(true);
    });

    it("has embedding field", () => {
      expect(schema.path("embedding")).toBeDefined();
    });

    it("embedding is required", () => {
      expect(schema.path("embedding").isRequired).toBe(true);
    });

    it("embedding is an array", () => {
      const embeddingPath = schema.path("embedding");
      expect(embeddingPath).toBeDefined();
      expect(embeddingPath.instance).toBe("Array");
    });
  });

  describe("indexes", () => {
    it("tenantId has an index", () => {
      const indexes = schema.indexes();
      const tenantIdIndexes = indexes.filter(
        ([fields]) => Object.keys(fields)[0] === "tenantId",
      );
      expect(tenantIdIndexes.length).toBeGreaterThan(0);
    });

    it("chunkId has a unique index", () => {
      const indexes = schema.indexes();
      const chunkIdIndex = indexes.find(
        ([fields, options]) =>
          Object.keys(fields)[0] === "chunkId" && options?.unique === true,
      );
      expect(chunkIdIndex).toBeDefined();
    });

    it("has the exact compound index { tenantId: 1, source: 1, chunkIndex: 1 }", () => {
      const indexes = schema.indexes();
      const compoundIndex = indexes.find(([fields]) =>
        fields.tenantId === 1 && fields.source === 1 && fields.chunkIndex === 1,
      );
      expect(compoundIndex).toBeDefined();
    });

    it("compound index field order is exactly tenantId, source, chunkIndex", () => {
      const indexes = schema.indexes();
      const compoundIndex = indexes.find(([fields]) =>
        fields.tenantId === 1 && fields.source === 1 && fields.chunkIndex === 1,
      );
      expect(compoundIndex).toBeDefined();
      const [fields, _options] = compoundIndex!;
      const fieldNames = Object.keys(fields);
      expect(fieldNames).toEqual(["tenantId", "source", "chunkIndex"]);
    });
  });

  describe("schema options", () => {
    it("does not enable timestamps", () => {
      expect(schema.get("timestamps")).toBeUndefined();
    });
  });

  describe("application fields", () => {
    it("has exactly the expected application fields plus internal fields", () => {
      const allPaths = Object.keys(schema.paths);
      const internalPaths = ["_id", "__v"];
      const applicationPaths = allPaths.filter(
        (p) => !internalPaths.includes(p),
      );

      const expectedFields = [
        "tenantId",
        "source",
        "chunkIndex",
        "text",
        "chunkId",
        "embedding",
      ];

      expect(applicationPaths.sort()).toEqual([...expectedFields].sort());
    });
  });
});
