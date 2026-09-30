import { Consumer, Message } from "kafkajs";
import { createKafka } from "./kafka";

const kafka = createKafka("order-service-consumer");

let consumer: Consumer;

interface SagaOrderCompletedEvent {
  orderId: string;
  paymentId: string;
  timestamp: string;
}

interface SagaOrderCancelledEvent {
  orderId: string;
  reason: string;
  timestamp: string;
}

export async function startConsumer(): Promise<void> {
  consumer = kafka.consumer({ groupId: "order-service-saga-group" });

  await consumer.connect();
  console.log("✅ Order service saga consumer connected");

  // Saga outcomes now arrive on the consolidated "saga.result" topic. The
  // specific outcome is selected via the KafkaJS "event-type" header.
  await consumer.subscribe({ topic: "saga.result", fromBeginning: false });
  console.log("📡 Subscribed to saga events");

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        await processSagaEvent(message);
      } catch (error) {
        console.error("Error processing saga event:", error);
      }
    },
  });
}

// Routes a single saga.result message to the appropriate Order handler based
// on the KafkaJS "event-type" header. Extracted from eachMessage so the
// header-based routing can be unit tested without a live Kafka broker.
export async function processSagaEvent(message: Message): Promise<void> {
  const eventType = message.headers?.["event-type"]?.toString();

  if (eventType === "saga.order-completed") {
    const event = JSON.parse(message.value!.toString()) as SagaOrderCompletedEvent;
    await handleOrderCompleted(event);
  } else if (eventType === "saga.order-cancelled") {
    const event = JSON.parse(message.value!.toString()) as SagaOrderCancelledEvent;
    await handleOrderCancelled(event);
  } else {
    console.log(`⏭️ Skipping saga.result event (event-type: ${eventType})`);
  }
}

export async function stopConsumer(): Promise<void> {
  if (consumer) {
    await consumer.disconnect();
    console.log("🔌 Order service saga consumer disconnected");
  }
}

async function handleOrderCompleted(
  event: SagaOrderCompletedEvent,
): Promise<void> {
  const Order = (await import("../models/Order")).default;

  await Order.updateOne(
    { orderId: event.orderId },
    {
      $set: {
        status: "CONFIRMED",
        sagaStatus: "COMPLETED",
        paymentId: event.paymentId,
        updatedAt: new Date(),
      },
    },
  );

  console.log(`✅ Order ${event.orderId} marked as CONFIRMED`);
}

async function handleOrderCancelled(
  event: SagaOrderCancelledEvent,
): Promise<void> {
  const Order = (await import("../models/Order")).default;

  await Order.updateOne(
    { orderId: event.orderId },
    {
      $set: {
        status: "CANCELLED",
        sagaStatus: "CANCELLED",
        failureReason: event.reason,
        updatedAt: new Date(),
      },
    },
  );

  console.log(`❌ Order ${event.orderId} marked as CANCELLED: ${event.reason}`);
}
