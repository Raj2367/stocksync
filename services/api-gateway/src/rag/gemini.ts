import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (client !== null) {
    return client;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY environment variable is not set; cannot initialize Gemini client",
    );
  }

  client = new GoogleGenAI({ apiKey });
  return client;
}

export async function embedText(text: string): Promise<number[]> {
  const ai = getClient();

  const model = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-2";

  const response = await ai.models.embedContent({
    model: model,
    contents: text,
    config: {
      outputDimensionality: 768,
    },
  });

  const values = response.embeddings?.[0]?.values;
  if (!values) {
    throw new Error("Gemini embedding response returned no values");
  }

  return values;
}
