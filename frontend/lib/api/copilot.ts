import { apiFetch } from "./client";

export interface CopilotSource {
  source: string;
  chunkIndex: number;
  score: number;
}

export interface LiveFactsUsed {
  order: boolean;
  saga: boolean;
}

export interface CopilotResponse {
  answer: string;
  sources: CopilotSource[];
  liveFactsUsed: LiveFactsUsed;
}

export interface CopilotRequest {
  question: string;
  orderId?: string;
}

export async function askCopilot(
  question: string,
  orderId?: string,
): Promise<CopilotResponse> {
  const body: CopilotRequest = { question };
  if (orderId !== undefined) {
    body.orderId = orderId;
  }

  return apiFetch<CopilotResponse>("/copilot/ask", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
