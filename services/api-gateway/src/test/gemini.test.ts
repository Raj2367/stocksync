describe("gemini embedding provider", () => {
  let mockEmbedContent: jest.Mock;
  let mockGoogleGenAI: jest.Mock;

  beforeEach(() => {
    jest.resetModules();

    mockEmbedContent = jest.fn();

    mockGoogleGenAI = jest.fn(() => ({
      models: {
        embedContent: mockEmbedContent,
      },
    }));

    jest.doMock("@google/genai", () => ({
      GoogleGenAI: mockGoogleGenAI,
    }));
  });

  it("importing the module while GEMINI_API_KEY is unset does not throw", () => {
    delete process.env.GEMINI_API_KEY;

    expect(() => {
      require("../rag/gemini");
    }).not.toThrow();
  });

  it("calling embedText() while GEMINI_API_KEY is unset throws a clear error", async () => {
    delete process.env.GEMINI_API_KEY;

    const { embedText } = require("../rag/gemini");

    await expect(embedText("hello")).rejects.toThrow(/GEMINI_API_KEY/);
  });

  it("the GoogleGenAI client is created using the API key", async () => {
    process.env.GEMINI_API_KEY = "test-key-123";

    const { embedText } = require("../rag/gemini");

    mockEmbedContent.mockResolvedValue({
      embeddings: [{ values: [0.1, 0.2, 0.3] }],
    });

    await embedText("hello");

    expect(mockGoogleGenAI).toHaveBeenCalledWith({ apiKey: "test-key-123" });
  });

  it("embedContent receives the expected model", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_EMBEDDING_MODEL = "gemini-embedding-2";

    const { embedText } = require("../rag/gemini");

    mockEmbedContent.mockResolvedValue({
      embeddings: [{ values: [0.1, 0.2, 0.3] }],
    });

    await embedText("hello");

    expect(mockEmbedContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-embedding-2",
      }),
    );
  });

  it("the supplied text is passed through as the embedding input", async () => {
    process.env.GEMINI_API_KEY = "test-key";

    const { embedText } = require("../rag/gemini");

    mockEmbedContent.mockResolvedValue({
      embeddings: [{ values: [0.1, 0.2, 0.3] }],
    });

    const inputText = "The quick brown fox jumps over the lazy dog.";
    await embedText(inputText);

    expect(mockEmbedContent).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: inputText,
      }),
    );
  });

  it("outputDimensionality is exactly 768", async () => {
    process.env.GEMINI_API_KEY = "test-key";

    const { embedText } = require("../rag/gemini");

    mockEmbedContent.mockResolvedValue({
      embeddings: [{ values: [0.1, 0.2, 0.3] }],
    });

    await embedText("hello");

    expect(mockEmbedContent).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          outputDimensionality: 768,
        }),
      }),
    );
  });

  it("the returned embedding is returned unchanged", async () => {
    process.env.GEMINI_API_KEY = "test-key";

    const { embedText } = require("../rag/gemini");

    const expectedEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5];
    mockEmbedContent.mockResolvedValue({
      embeddings: [{ values: expectedEmbedding }],
    });

    const result = await embedText("hello");

    expect(result).toEqual(expectedEmbedding);
  });

  it("calling embedText() twice constructs the GoogleGenAI client exactly once", async () => {
    process.env.GEMINI_API_KEY = "test-key";

    const { embedText } = require("../rag/gemini");

    mockEmbedContent.mockResolvedValue({
      embeddings: [{ values: [0.1, 0.2, 0.3] }],
    });

    await embedText("first");
    await embedText("second");

    expect(mockGoogleGenAI).toHaveBeenCalledTimes(1);
  });

  it("no real network request occurs", async () => {
    process.env.GEMINI_API_KEY = "test-key";

    const { embedText } = require("../rag/gemini");

    mockEmbedContent.mockResolvedValue({
      embeddings: [{ values: [0.1, 0.2, 0.3] }],
    });

    await embedText("hello");

    expect(mockGoogleGenAI).toHaveBeenCalledTimes(1);
    expect(mockEmbedContent).toHaveBeenCalledTimes(1);
  });
});
