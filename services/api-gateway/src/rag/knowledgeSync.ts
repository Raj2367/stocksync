import * as path from "node:path";
import * as fs from "node:fs";
import { chunkDocument, Chunk } from "./chunker";
import { embedText } from "./gemini";
import KnowledgeChunk from "../models/KnowledgeChunk";

export class CorpusRootMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CorpusRootMissingError";
  }
}

export class CorpusEmptyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CorpusEmptyError";
  }
}

export class CorpusStructureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CorpusStructureError";
  }
}

function deriveTenantId(firstSegment: string): string {
  if (firstSegment === "shared") {
    return "shared";
  }
  return `tenant-${firstSegment}`;
}

export async function syncKnowledgeCorpus(corpusRoot: string): Promise<void> {
  const absoluteRoot = path.resolve(corpusRoot);

  if (!fs.existsSync(absoluteRoot)) {
    throw new CorpusRootMissingError(`Corpus root does not exist: ${absoluteRoot}`);
  }

  const discoveredFiles: string[] = [];

  function walk(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        if (!entry.name.endsWith(".md")) {
          continue;
        }
        discoveredFiles.push(fullPath);
      }
    }
  }

  walk(absoluteRoot);

  if (discoveredFiles.length === 0) {
    throw new CorpusEmptyError(`No Markdown files found in corpus: ${absoluteRoot}`);
  }

  for (const filePath of discoveredFiles) {
    const relPath = path.relative(absoluteRoot, filePath);
    const relPosix = relPath.split(path.sep).join("/");
    const segments = relPosix.split("/");

    if (segments.length < 2) {
      throw new CorpusStructureError(
        `Markdown file at corpus root is not allowed — must be under a tenant directory: ${filePath}`,
      );
    }
  }

  const currentChunks: Chunk[] = [];
  const syncedTenants = new Set<string>();

  for (const filePath of discoveredFiles) {
    const relPath = path.relative(absoluteRoot, filePath);
    const relPosix = relPath.split(path.sep).join("/");
    const segments = relPosix.split("/");

    const firstSegment = segments[0];
    const tenantId = deriveTenantId(firstSegment);
    const source = relPosix;
    syncedTenants.add(tenantId);

    const documentText = fs.readFileSync(filePath, "utf-8");
    const chunks = chunkDocument(documentText, source, tenantId);

    for (const chunk of chunks) {
      currentChunks.push({
        tenantId: chunk.tenantId,
        source: chunk.source,
        chunkIndex: chunk.chunkIndex,
        text: chunk.text,
        chunkId: chunk.chunkId,
      });
    }
  }

  const existingIds = new Set<string>();
  const existing = await KnowledgeChunk.find({
    tenantId: { $in: Array.from(syncedTenants) },
    chunkId: { $in: currentChunks.map((c) => c.chunkId) },
  }).select("chunkId");
  for (const doc of existing) {
    existingIds.add(doc.chunkId);
  }

  const currentIds: string[] = [];

  for (const chunk of currentChunks) {
    currentIds.push(chunk.chunkId);

    if (existingIds.has(chunk.chunkId)) {
      continue;
    }

    const embedding = await embedText(chunk.text);

    await KnowledgeChunk.updateOne(
      { chunkId: chunk.chunkId },
      {
        $set: {
          tenantId: chunk.tenantId,
          source: chunk.source,
          chunkIndex: chunk.chunkIndex,
          text: chunk.text,
          chunkId: chunk.chunkId,
          embedding: embedding,
        },
      },
      { upsert: true },
    );
  }
  await KnowledgeChunk.deleteMany({
    tenantId: { $in: Array.from(syncedTenants) },
    chunkId: { $nin: currentIds },
  });
}
