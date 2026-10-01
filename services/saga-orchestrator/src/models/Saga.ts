import mongoose, { Schema, Document } from "mongoose";

export type SagaStatus =
  | "PENDING"
  | "AWAITING_INVENTORY"
  | "AWAITING_PAYMENT"
  | "COMPLETED"
  | "CANCELLING"
  | "CANCELLED";

export interface SagaStep {
  action: string;
  status: "success" | "failure" | "compensating";
  timestamp: string;
  details?: string;
}

export interface ISaga extends Document {
  orderId: string;
  tenantId: string;
  productId: string;
  quantity: number;
  customerEmail: string | null;
  status: SagaStatus;
  paymentId?: string | null;
  failureReason?: string | null;
  steps: SagaStep[];
}

const SagaStepSchema = new Schema<SagaStep>(
  {
    action: { type: String, required: true },
    status: {
      type: String,
      enum: ["success", "failure", "compensating"],
      required: true,
    },
    timestamp: { type: String, required: true },
    details: { type: String },
  },
  { _id: false },
);

const SagaSchema = new Schema<ISaga>(
  {
    orderId: { type: String, required: true },
    tenantId: { type: String, required: true },
    productId: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    customerEmail: { type: String, default: null },
    status: {
      type: String,
      enum: [
        "PENDING",
        "AWAITING_INVENTORY",
        "AWAITING_PAYMENT",
        "COMPLETED",
        "CANCELLING",
        "CANCELLED",
      ],
      default: "AWAITING_INVENTORY",
    },
    paymentId: { type: String, default: null },
    failureReason: { type: String, default: null },
    steps: { type: [SagaStepSchema], default: [] },
  },
  { timestamps: true },
);

// One saga per order per tenant; supports tenant-scoped lookups.
SagaSchema.index({ orderId: 1, tenantId: 1 }, { unique: true });
SagaSchema.index({ tenantId: 1, createdAt: -1 });

export default mongoose.model<ISaga>("Saga", SagaSchema);
