import { Kafka, Consumer } from "kafkajs";

const KAFKA_BROKER = process.env.KAFKA_BROKER || "kafka:29092";

const kafka = new Kafka({
  clientId: "order-service-consumer",
  brokers: [KAFKA_BROKER],
  retry: {
    initialRetryTime: 300,
    retries: 10,
  },
});

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

  await consumer.subscribe({
    topic: "saga.order-completed",
    fromBeginning: false,
  });
  await consumer.subscribe({
    topic: "saga.order-cancelled",
    fromBeginning: false,
  });
  console.log("📡 Subscribed to saga events");

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const event = JSON.parse(message.value!.toString());

        if (topic === "saga.order-completed") {
          await handleOrderCompleted(event as SagaOrderCompletedEvent);
        } else if (topic === "saga.order-cancelled") {
          await handleOrderCancelled(event as SagaOrderCancelledEvent);
        }
      } catch (error) {
        console.error("Error processing saga event:", error);
      }
    },
  });
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
