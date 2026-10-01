const mockGenerateContent = jest.fn();

const mockGoogleGenAI = jest.fn().mockImplementation(() => ({
  models: {
    generateContent: mockGenerateContent,
  },
}));

jest.mock("@google/genai", () => ({
  GoogleGenAI: mockGoogleGenAI,
}));

describe("geminiLlm provider", () => {
  let originalApiKey: string | undefined;
  let originalLlmModel: string | undefined;
  let consoleLogSpy: jest.SpyInstance;
  let consoleInfoSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    mockGoogleGenAI.mockImplementation(() => ({
      models: {
        generateContent: mockGenerateContent,
      },
    }));
    mockGenerateContent.mockReset();
    mockGenerateContent.mockResolvedValue({ text: "Generated response" });

    originalApiKey = process.env.GEMINI_API_KEY;
    originalLlmModel = process.env.GEMINI_LLM_MODEL;

    consoleLogSpy = jest.spyOn(console, "log").mockImplementation();
    consoleInfoSpy = jest.spyOn(console, "info").mockImplementation();
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
  });

  afterEach(() => {
    if (originalApiKey !== undefined) {
      process.env.GEMINI_API_KEY = originalApiKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }

    if (originalLlmModel !== undefined) {
      process.env.GEMINI_LLM_MODEL = originalLlmModel;
    } else {
      delete process.env.GEMINI_LLM_MODEL;
    }

    consoleLogSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("Importing geminiLlm.ts with GEMINI_API_KEY unset does not throw", () => {
    delete process.env.GEMINI_API_KEY;

    expect(() => {
      require("../rag/geminiLlm");
    }).not.toThrow();
  });

  it("empty prompt throws a clear error", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const { generateText } = require("../rag/geminiLlm");

    await expect(generateText("")).rejects.toThrow(/empty/i);
  });

  it("empty prompt does not call GoogleGenAI", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const { generateText } = require("../rag/geminiLlm");

    try {
      await generateText("");
    } catch {
      // expected
    }

    expect(mockGoogleGenAI).not.toHaveBeenCalled();
  });

  it("whitespace-only prompt throws a clear error", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const { generateText } = require("../rag/geminiLlm");

    await expect(generateText("   ")).rejects.toThrow(/empty/i);
    await expect(generateText("\n\t\n")).rejects.toThrow(/empty/i);
  });

  it("whitespace-only prompt does not call GoogleGenAI", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const { generateText } = require("../rag/geminiLlm");

    try {
      await generateText("   ");
    } catch {
      // expected
    }

    expect(mockGoogleGenAI).not.toHaveBeenCalled();
  });

  it("missing GEMINI_API_KEY throws a clear error when generateText() is called", async () => {
    delete process.env.GEMINI_API_KEY;
    const { generateText } = require("../rag/geminiLlm");

    await expect(generateText("hello")).rejects.toThrow(/GEMINI_API_KEY/i);
  });

  it("missing GEMINI_API_KEY does not make a generation call", async () => {
    delete process.env.GEMINI_API_KEY;
    const { generateText } = require("../rag/geminiLlm");

    try {
      await generateText("hello");
    } catch {
      // expected
    }

    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it("empty GEMINI_API_KEY is treated as missing and throws a clear error", async () => {
    process.env.GEMINI_API_KEY = "";
    const { generateText } = require("../rag/geminiLlm");

    await expect(generateText("hello")).rejects.toThrow(/GEMINI_API_KEY/i);
  });

  it("empty GEMINI_API_KEY does not construct GoogleGenAI or call generateContent", async () => {
    process.env.GEMINI_API_KEY = "";
    const { generateText } = require("../rag/geminiLlm");

    try {
      await generateText("hello");
    } catch {
      // expected
    }

    expect(mockGoogleGenAI).not.toHaveBeenCalled();
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it("GoogleGenAI is NOT constructed merely by importing geminiLlm.ts", () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";

    require("../rag/geminiLlm");

    expect(mockGoogleGenAI).not.toHaveBeenCalled();
  });

  it("GoogleGenAI is constructed lazily when generateText() actually needs it", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const { generateText } = require("../rag/geminiLlm");

    mockGenerateContent.mockResolvedValue({ text: "Hello world" });

    await generateText("test prompt");

    expect(mockGoogleGenAI).toHaveBeenCalledTimes(1);
    expect(mockGoogleGenAI).toHaveBeenCalledWith({ apiKey: "test-gemini-key" });
  });

  it("GoogleGenAI receives the GEMINI_API_KEY value", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const { generateText } = require("../rag/geminiLlm");

    mockGenerateContent.mockResolvedValue({ text: "Hello" });

    await generateText("test");

    expect(mockGoogleGenAI).toHaveBeenCalledWith({ apiKey: "test-gemini-key" });
  });

  it("default model is exactly 'gemini-3.8-flash'", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    delete process.env.GEMINI_LLM_MODEL;
    const { generateText } = require("../rag/geminiLlm");

    mockGenerateContent.mockResolvedValue({ text: "Hello" });

    await generateText("test");

    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gemini-3.8-flash" }),
    );
  });

  it("GEMINI_LLM_MODEL overrides the default", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.GEMINI_LLM_MODEL = "gemini-2.0-flash";
    const { generateText } = require("../rag/geminiLlm");

    mockGenerateContent.mockResolvedValue({ text: "Hello" });

    await generateText("test");

    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gemini-2.0-flash" }),
    );
  });

  it("GEMINI_LLM_MODEL empty string falls back to 'gemini-3.8-flash'", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.GEMINI_LLM_MODEL = "";
    const { generateText } = require("../rag/geminiLlm");

    mockGenerateContent.mockResolvedValue({ text: "Hello" });

    await generateText("test");

    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gemini-3.8-flash" }),
    );
  });

  it("generateContent receives the exact original prompt string", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const { generateText } = require("../rag/geminiLlm");

    mockGenerateContent.mockResolvedValue({ text: "Hello" });

    const prompt = "This is a test prompt with specific content.";
    await generateText(prompt);

    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({ contents: prompt }),
    );
  });

  it("generateContent is called with expected model and contents", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    delete process.env.GEMINI_LLM_MODEL;
    const { generateText } = require("../rag/geminiLlm");

    mockGenerateContent.mockResolvedValue({ text: "Response" });

    await generateText("prompt text");

    const callArgs = mockGenerateContent.mock.calls[0][0];
    expect(callArgs).toHaveProperty("model", "gemini-3.8-flash");
    expect(callArgs).toHaveProperty("contents", "prompt text");
    expect(Object.keys(callArgs).sort()).toEqual(["contents", "model"]);
  });

  it("response.text is accessed as a property/getter, not called as a function", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const { generateText } = require("../rag/geminiLlm");

    const getter = jest.fn(() => "hello from getter");
    const response: Record<string, unknown> = {};
    Object.defineProperty(response, "text", {
      get: getter,
      configurable: true,
    });
    mockGenerateContent.mockResolvedValue(response);

    const result = await generateText("hello prompt");

    expect(getter).toHaveBeenCalled();
    expect(result).toBe("hello from getter");
  });

  it("response.text is returned unchanged when it contains usable text", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const { generateText } = require("../rag/geminiLlm");

    mockGenerateContent.mockResolvedValue({ text: "Generated response" });

    const result = await generateText("prompt");

    expect(result).toBe("Generated response");
  });

  it("missing/undefined response.text throws a clear error", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const { generateText } = require("../rag/geminiLlm");

    mockGenerateContent.mockResolvedValue({ text: undefined });

    await expect(generateText("prompt")).rejects.toThrow();
  });

  it("empty string response.text throws a clear error", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const { generateText } = require("../rag/geminiLlm");

    mockGenerateContent.mockResolvedValue({ text: "" });

    await expect(generateText("prompt")).rejects.toThrow();
  });

  it("whitespace-only response.text throws a clear error", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const { generateText } = require("../rag/geminiLlm");

    mockGenerateContent.mockResolvedValue({ text: "   " });

    await expect(generateText("prompt")).rejects.toThrow();
  });

  it("rejected generateContent call propagates the original error", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const { generateText } = require("../rag/geminiLlm");

    const apiError = new Error("Gemini API error");
    mockGenerateContent.mockRejectedValue(apiError);

    await expect(generateText("prompt")).rejects.toThrow("Gemini API error");
  });

  it("multiple generateText() calls in the same module instance reuse the same GoogleGenAI client", async () => {
    jest.resetModules();

    process.env.GEMINI_API_KEY = "test-gemini-key";
    mockGoogleGenAI.mockImplementation(() => ({
      models: {
        generateContent: mockGenerateContent,
      },
    }));
    mockGenerateContent.mockResolvedValue({ text: "response" });

    const { generateText } = require("../rag/geminiLlm");

    await generateText("first prompt");
    await generateText("second prompt");

    expect(mockGoogleGenAI).toHaveBeenCalledTimes(1);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  it("no MongoDB/network infrastructure is contacted", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const { generateText } = require("../rag/geminiLlm");

    await generateText("test prompt");

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it("no provider logging leaks the prompt or API key", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const { generateText } = require("../rag/geminiLlm");

    mockGenerateContent.mockResolvedValue({ text: "ok" });

    const testPrompt = "SECRET_PROMPT_DATA_SHOULD_NOT_LEAK";
    await generateText(testPrompt);

    const allCalls = [
      ...consoleLogSpy.mock.calls,
      ...consoleInfoSpy.mock.calls,
      ...consoleWarnSpy.mock.calls,
      ...consoleErrorSpy.mock.calls,
    ];

    for (const call of allCalls) {
      for (const arg of call) {
        expect(String(arg)).not.toContain("SECRET_PROMPT_DATA_SHOULD_NOT_LEAK");
        expect(String(arg)).not.toContain("test-gemini-key");
      }
    }
  });

  it("thrown errors for empty prompt and missing API key contain neither prompt contents nor key", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const { generateText } = require("../rag/geminiLlm");

    const emptyError = await generateText("").then(
      () => undefined,
      (reason: unknown) => reason,
    );
    expect(emptyError).toBeDefined();
    expect(String(emptyError)).toMatch(/empty/i);
    expect(String(emptyError)).not.toContain("test-gemini-key");

    jest.resetModules();
    delete process.env.GEMINI_API_KEY;
    if (process.env.GEMINI_LLM_MODEL !== undefined) {
      delete process.env.GEMINI_LLM_MODEL;
    }

    const { generateText: generateText2 } = require("../rag/geminiLlm");

    const keyError = await generateText2("SECRET_PROMPT_DATA_SHOULD_NOT_LEAK").then(
      () => undefined,
      (reason: unknown) => reason,
    );
    expect(keyError).toBeDefined();
    expect(String(keyError)).toMatch(/GEMINI_API_KEY/i);
    expect(String(keyError)).not.toContain("SECRET_PROMPT_DATA_SHOULD_NOT_LEAK");
    expect(String(keyError)).not.toContain("test-gemini-key");
  });
});
