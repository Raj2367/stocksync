import axios from "axios";
import { updateSaga, addSagaStep, SagaStatus } from "./store";
import {
  publishOrderCompleted,
  publishOrderCancelled,
} from "../events/producer";

const INVENTORY_SERVICE_URL =
  process.env.INVENTORY_SERVICE_URL || "http://inventory-service:3002";
const ORDER_SERVICE_URL =
  process.env.ORDER_SERVICE_URL || "http://order-service:3001";

export async function handleInventoryReserved(orderId: string): Promise<void> {
  updateSaga(orderId, { status: "AWAITING_PAYMENT" });
  addSagaStep(orderId, {
    action: "INVENTORY_RESERVED",
    status: "success",
    timestamp: new Date().toISOString(),
  });
  console.log(`📝 Saga ${orderId}: Inventory reserved, awaiting payment`);
}

export async function handleInventoryReservationFailed(
  orderId: string,
  reason: string,
): Promise<void> {
  updateSaga(orderId, {
    status: "CANCELLED",
    failureReason: reason,
  });
  addSagaStep(orderId, {
    action: "INVENTORY_RESERVATION_FAILED",
    status: "failure",
    timestamp: new Date().toISOString(),
    details: reason,
  });

  // Publish cancellation
  await publishOrderCancelled({
    orderId,
    reason: `Inventory reservation failed: ${reason}`,
    timestamp: new Date().toISOString(),
  });

  console.log(
    `📝 Saga ${orderId}: Cancelled due to inventory failure - ${reason}`,
  );
}

export async function handlePaymentProcessed(
  orderId: string,
  paymentId: string,
): Promise<void> {
  updateSaga(orderId, {
    status: "COMPLETED",
    paymentId,
  });
  addSagaStep(orderId, {
    action: "PAYMENT_PROCESSED",
    status: "success",
    timestamp: new Date().toISOString(),
    details: `Payment ID: ${paymentId}`,
  });

  // Publish completion
  await publishOrderCompleted({
    orderId,
    paymentId,
    timestamp: new Date().toISOString(),
  });

  console.log(`🎉 Saga ${orderId}: COMPLETED with payment ${paymentId}`);
}

export async function handlePaymentFailed(
  orderId: string,
  productId: string,
  quantity: number,
  reason: string,
): Promise<void> {
  updateSaga(orderId, {
    status: "CANCELLING",
    failureReason: reason,
  });
  addSagaStep(orderId, {
    action: "PAYMENT_FAILED",
    status: "failure",
    timestamp: new Date().toISOString(),
    details: reason,
  });

  console.log(
    `📝 Saga ${orderId}: Payment failed (${reason}), starting compensation...`,
  );

  // Step 1: Release inventory (compensating transaction)
  try {
    await axios.post(`${INVENTORY_SERVICE_URL}/inventory/release`, {
      orderId,
      productId,
      quantity,
    });

    addSagaStep(orderId, {
      action: "RELEASE_INVENTORY",
      status: "success",
      timestamp: new Date().toISOString(),
    });
    console.log(`♻️ Saga ${orderId}: Inventory released successfully`);
  } catch (error: any) {
    addSagaStep(orderId, {
      action: "RELEASE_INVENTORY",
      status: "failure",
      timestamp: new Date().toISOString(),
      details: error.message,
    });
    console.error(
      `💥 Saga ${orderId}: Failed to release inventory!`,
      error.message,
    );
    // In production: alert on-call, log to dead-letter queue, retry
  }

  // Step 2: Mark order as cancelled
  updateSaga(orderId, { status: "CANCELLED" });

  await publishOrderCancelled({
    orderId,
    reason: `Payment failed: ${reason}`,
    timestamp: new Date().toISOString(),
  });

  console.log(`📝 Saga ${orderId}: CANCELLED with compensation complete`);
}
