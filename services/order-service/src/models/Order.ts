import mongoose, { Schema, Document } from "mongoose";

export interface IOrder extends Document {
  orderId: string;
  productId: string;
  quantity: number;
  customerEmail: string | null;
  status: "PENDING" | "CONFIRMED" | "CANCELLED";
  sagaStatus:
    | "AWAITING_INVENTORY"
    | "AWAITING_PAYMENT"
    | "COMPLETED"
    | "CANCELLED";
  paymentId?: string;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const OrderSchema = new Schema<IOrder>(
  {
    orderId: { type: String, required: true, unique: true, index: true },
    productId: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    customerEmail: { type: String, default: null },
    status: {
      type: String,
      enum: ["PENDING", "CONFIRMED", "CANCELLED"],
      default: "PENDING",
    },
    sagaStatus: {
      type: String,
      enum: [
        "AWAITING_INVENTORY",
        "AWAITING_PAYMENT",
        "COMPLETED",
        "CANCELLED",
      ],
      default: "AWAITING_INVENTORY",
    },
    paymentId: { type: String, default: null },
    failureReason: { type: String, default: null },
  },
  { timestamps: true },
);

// Index for efficient queries
OrderSchema.index({ status: 1, createdAt: -1 });
OrderSchema.index({ sagaStatus: 1 });

export default mongoose.model<IOrder>("Order", OrderSchema);
