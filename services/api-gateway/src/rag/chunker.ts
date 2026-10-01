import * as crypto from "crypto";

export const MAX_CHUNK_SIZE = 800;

export interface Chunk {
  tenantId: string;
  source: string;
  chunkIndex: number;
  text: string;
  chunkId: string;
}

export function hashChunk(tenantId: string, source: string, text: string): string {
  const trimmed = text.trim();
  const input = `${tenantId}|${source}|${trimmed}`;
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function splitAtSentenceBoundaries(text: string): string[] {
  const sentences: string[] = [];
  const regex = /[.!?](\s+|$)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const end = match.index + match[0].length;
    sentences.push(text.slice(lastIndex, end).trim());
    lastIndex = end;
  }

  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex).trim();
    if (remaining.length > 0) {
      sentences.push(remaining);
    }
  }

  return sentences;
}

function greedyChunkSentences(sentences: string[]): string[] {
  const chunks: string[] = [];
  let current: string[] = [];

  for (const sentence of sentences) {
    const candidate = current.concat(sentence).join(" ").trim();
    if (candidate.length > MAX_CHUNK_SIZE && current.length > 0) {
      chunks.push(current.join(" ").trim());
      current = [sentence];
    } else {
      current.push(sentence);
    }
  }

  if (current.length > 0) {
    chunks.push(current.join(" ").trim());
  }

  return chunks;
}

function hardSplit(text: string): string[] {
  const chunks: string[] = [];
  let offset = 0;
  while (offset < text.length) {
    const end = Math.min(offset + MAX_CHUNK_SIZE, text.length);
    chunks.push(text.slice(offset, end).trim());
    offset = end;
  }
  return chunks;
}

function splitLongParagraph(paragraph: string): string[] {
  const sentences = splitAtSentenceBoundaries(paragraph);
  const allSentences = sentences.filter((s) => s.length > 0);

  if (allSentences.length === 0) {
    return hardSplit(paragraph.trim());
  }

  const result: string[] = [];

  for (const sentence of allSentences) {
    if (sentence.length > MAX_CHUNK_SIZE) {
      result.push(...hardSplit(sentence.trim()));
    } else {
      result.push(sentence.trim());
    }
  }

  return greedyChunkSentences(result);
}

function combineIntoChunks(paragraphs: string[]): string[] {
  const chunks: string[] = [];
  let current: string[] = [];

  for (const paragraph of paragraphs) {
    const trimmedParagraph = paragraph.trim();

    if (trimmedParagraph.length > MAX_CHUNK_SIZE) {
      if (current.length > 0) {
        chunks.push(current.join("\n\n").trim());
        current = [];
      }
      const subChunks = splitLongParagraph(trimmedParagraph);
      for (const sub of subChunks) {
        chunks.push(sub.trim());
      }
      continue;
    }

    const candidate = current.concat(trimmedParagraph).join("\n\n").trim();
    if (candidate.length > MAX_CHUNK_SIZE && current.length > 0) {
      chunks.push(current.join("\n\n").trim());
      current = [trimmedParagraph];
    } else {
      current.push(trimmedParagraph);
    }
  }

  if (current.length > 0) {
    chunks.push(current.join("\n\n").trim());
  }

  return chunks;
}

export function chunkDocument(
  documentText: string,
  source: string,
  tenantId: string,
): Chunk[] {
  if (!documentText || documentText.trim().length === 0) {
    return [];
  }

  const paragraphs = splitParagraphs(documentText);
  const chunks = combineIntoChunks(paragraphs);

  return chunks.map((text, index) => ({
    tenantId,
    source,
    chunkIndex: index,
    text,
    chunkId: hashChunk(tenantId, source, text),
  }));
}
