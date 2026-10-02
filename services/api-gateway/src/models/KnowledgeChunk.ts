import mongoose, { Schema, Document } from "mongoose";

export interface IKnowledgeChunk extends Document {
  tenantId: string;
  source: string;
  chunkIndex: number;
  text: string;
  chunkId: string;
  embedding: number[];
}

export const KnowledgeChunkSchema = new Schema<IKnowledgeChunk>({
  tenantId: { type: String, required: true, index: true },
  source: { type: String, required: true },
  chunkIndex: { type: Number, required: true },
  text: { type: String, required: true },
  chunkId: { type: String, required: true, unique: true, index: true },
  embedding: { type: [Number], required: true },
});

KnowledgeChunkSchema.index({ tenantId: 1, source: 1, chunkIndex: 1 });

export default mongoose.model<IKnowledgeChunk>("KnowledgeChunk", KnowledgeChunkSchema);
