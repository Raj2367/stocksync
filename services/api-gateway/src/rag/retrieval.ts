import KnowledgeChunk from "../models/KnowledgeChunk";

export interface RetrievedChunk {
  tenantId: string;
  source: string;
  chunkIndex: number;
  text: string;
  chunkId: string;
  score: number;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitudeA = Math.sqrt(normA);
  const magnitudeB = Math.sqrt(normB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dot / (magnitudeA * magnitudeB);
}

export async function retrieveRelevantChunks(
  tenantId: string,
  queryEmbedding: number[],
  topK: number = 5,
): Promise<RetrievedChunk[]> {
  const candidates = await KnowledgeChunk.find({
    tenantId: { $in: [tenantId, "shared"] },
  })
    .select("tenantId source chunkIndex text chunkId embedding")
    .lean();

  if (candidates.length === 0) {
    return [];
  }

  const scored: RetrievedChunk[] = [];

  for (const chunk of candidates) {
    const chunkEmbedding = chunk.embedding as number[];

    let score: number;

    if (queryEmbedding.length === 0) {
      score = 0;
    } else if (queryEmbedding.length !== chunkEmbedding.length) {
      throw new Error(
        `Embedding dimension mismatch: query=${queryEmbedding.length}, chunk=${chunkEmbedding.length}`,
      );
    } else {
      score = cosineSimilarity(queryEmbedding, chunkEmbedding);
    }

    scored.push({
      tenantId: chunk.tenantId,
      source: chunk.source,
      chunkIndex: chunk.chunkIndex,
      text: chunk.text,
      chunkId: chunk.chunkId,
      score,
    });
  }

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topK);
}
