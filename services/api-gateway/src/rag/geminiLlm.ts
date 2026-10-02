import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (client !== null) {
    return client;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }

  client = new GoogleGenAI({ apiKey });
  return client;
}

export async function generateText(prompt: string): Promise<string> {
  if (prompt.trim().length === 0) {
    throw new Error("Prompt must not be empty");
  }

  const ai = getClient();

  const model = process.env.GEMINI_LLM_MODEL || "gemini-3.5-flash-lite";

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
  });

  const text = response.text;
  if (text === undefined || text === null || text === "" || text.trim().length === 0) {
    throw new Error("Gemini generation returned no usable text");
  }

  return text;
}
