import { Kafka, Consumer, Message } from "kafkajs";
import { createSaga, getSaga, updateSaga, addSagaStep } from "../saga/store";
import {
  handleInventoryReserved,
  handleInventoryReservationFailed,
  handlePaymentProcessed,
  handlePaymentFailed,
} from "../saga/engine";

const KAFKA_BROKER = process.env.KAFKA_BROKER || "kafka:29092";

const kafka = new Kafka({
  clientId: "saga-orchestrator",
  brokers: [KAFKA_BROKER],
  retry: {
    initialRetryTime: 300,
    retries: 10,
  },
});

let consumer: Consumer;

interface OrderCreatedEvent {
  orderId: string;
  tenantId: string;
  productId: string;
  quantity: number;
  customerEmail: string | null;
  paymentMode: string;
  timestamp: string;
}

interface InventoryReservedEvent {
  orderId: string;
  tenantId: string;
  productId: string;
  quantity: number;
  paymentMode: string;
  reservationId: number;
  timestamp: string;
}

interface InventoryReservationFailedEvent {
  orderId: string;
  tenantId: string;
  productId: string;
  quantity: number;
  paymentMode: string;
  reason: string;
  timestamp: string;
}

interface PaymentProcessedEvent {
  orderId: string;
  tenantId: string;
  productId: string;
  quantity: number;
  paymentMode: string;
  paymentId: string;
  amount: number;
  timestamp: string;
}

interface PaymentFailedEvent {
  orderId: string;
  tenantId: string;
  productId: string;
  quantity: number;
  paymentMode: string;
  reason: string;
  timestamp: string;
}

export async function startConsumer(): Promise<void> {
  consumer = kafka.consumer({ groupId: "saga-orchestrator-group" });

  await consumer.connect();
  console.log("✅ Saga orchestrator connected to Kafka");

  // Subscribe to all relevant topics. Inventory and payment outcomes
  // now arrive on consolidated topics; the specific event-type header
  // is used inside eachMessage to dispatch to the correct handler.
  await consumer.subscribe({ topic: "order.created", fromBeginning: false });
  await consumer.subscribe({ topic: "inventory.result", fromBeginning: false });
  await consumer.subscribe({ topic: "payment.result", fromBeginning: false });

  console.log("📡 Subscribed to saga topics");

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        await dispatchSagaEvent(topic, message);
      } catch (error) {
        console.error(`Error processing ${topic}:`, error);
      }
    },
  });
}

// Routes a single Kafka message to the appropriate saga handler. Extracted
// from eachMessage so the header-based routing can be unit tested without
// a live Kafka broker.
export async function dispatchSagaEvent(
  topic: string,
  message: Message,
): Promise<void> {
  const event = JSON.parse(message.value!.toString());
  console.log(`\n📥 [${topic}] ${event.orderId}`);

  // order.created keeps its original, topic-based routing (unchanged).
  if (topic === "order.created") {
    await onOrderCreated(event as OrderCreatedEvent);
    return;
  }

  // For the consolidated inventory.result / payment.result topics, route by
  // the KafkaJS "event-type" header so a single topic can carry both
  // outcome kinds. Unknown/missing event-types are skipped.
  const eventType = message.headers?.["event-type"]?.toString();

  if (topic === "inventory.result") {
    switch (eventType) {
      case "inventory.reserved":
        await onInventoryReserved(event as InventoryReservedEvent);
        break;
      case "inventory.reservation-failed":
        await onInventoryReservationFailed(
          event as InventoryReservationFailedEvent,
        );
        break;
      default:
        console.log(
          `⏭️ Skipping inventory.result event (event-type: ${eventType})`,
        );
    }
    return;
  }

  if (topic === "payment.result") {
    switch (eventType) {
      case "payment.processed":
        await onPaymentProcessed(event as PaymentProcessedEvent);
        break;
      case "payment.failed":
        await onPaymentFailed(event as PaymentFailedEvent);
        break;
      default:
        console.log(
          `⏭️ Skipping payment.result event (event-type: ${eventType})`,
        );
    }
    return;
  }

  console.log(`⏭️ Skipping unhandled topic: ${topic}`);
}

export async function stopConsumer(): Promise<void> {
  if (consumer) {
    await consumer.disconnect();
    console.log("🔌 Saga orchestrator disconnected");
  }
}

export async function onOrderCreated(event: OrderCreatedEvent): Promise<void> {
  await createSaga(
    event.orderId,
    event.productId,
    event.quantity,
    event.customerEmail,
    event.tenantId,
  );
  console.log(`🆕 Saga started for order ${event.orderId}`);
}

export async function onInventoryReserved(
  event: InventoryReservedEvent,
): Promise<void> {
  const saga = await getSaga(event.orderId, event.tenantId);
  if (!saga) {
    console.warn(`No saga found for order ${event.orderId}`);
    return;
  }
  await handleInventoryReserved(event.orderId, event.tenantId);
}

export async function onInventoryReservationFailed(
  event: InventoryReservationFailedEvent,
): Promise<void> {
  const saga = await getSaga(event.orderId, event.tenantId);
  if (!saga) {
    console.warn(`No saga found for order ${event.orderId}`);
    return;
  }
  await handleInventoryReservationFailed(
    event.orderId,
    event.reason,
    event.tenantId,
    event.paymentMode,
  );
}

export async function onPaymentProcessed(event: PaymentProcessedEvent): Promise<void> {
  const saga = await getSaga(event.orderId, event.tenantId);
  if (!saga) {
    console.warn(`No saga found for order ${event.orderId}`);
    return;
  }
  await handlePaymentProcessed(
    event.orderId,
    event.paymentId,
    event.tenantId,
    event.paymentMode,
  );
}

export async function onPaymentFailed(event: PaymentFailedEvent): Promise<void> {
  const saga = await getSaga(event.orderId, event.tenantId);
  if (!saga) {
    console.warn(`No saga found for order ${event.orderId}`);
    return;
  }
  await handlePaymentFailed(
    event.orderId,
    event.productId,
    event.quantity,
    event.reason,
    event.tenantId,
    event.paymentMode,
  );
}
