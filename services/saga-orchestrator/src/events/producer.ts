import { Kafka, Producer } from "kafkajs";

const KAFKA_BROKER = process.env.KAFKA_BROKER || "kafka:29092";

const kafka = new Kafka({
  clientId: "saga-orchestrator-producer",
  brokers: [KAFKA_BROKER],
  retry: {
    initialRetryTime: 300,
    retries: 10,
  },
});

let producer: Producer;

export async function connectProducer(): Promise<void> {
  producer = kafka.producer();
  await producer.connect();
  console.log("✅ Saga producer connected");
}

export async function disconnectProducer(): Promise<void> {
  if (producer) {
    await producer.disconnect();
  }
}

export interface SagaOrderCompletedEvent {
  orderId: string;
  paymentId: string;
  timestamp: string;
}

export interface SagaOrderCancelledEvent {
  orderId: string;
  reason: string;
  timestamp: string;
}

export async function publishOrderCompleted(
  event: SagaOrderCompletedEvent,
): Promise<void> {
  if (!producer) await connectProducer();

  await producer.send({
    topic: "saga.order-completed",
    messages: [
      {
        key: event.orderId,
        value: JSON.stringify(event),
        headers: {
          "event-type": "saga.order-completed",
          source: "saga-orchestrator",
        },
      },
    ],
  });

  console.log(`📤 Published saga.order-completed: ${event.orderId}`);
}

export async function publishOrderCancelled(
  event: SagaOrderCancelledEvent,
): Promise<void> {
  if (!producer) await connectProducer();

  await producer.send({
    topic: "saga.order-cancelled",
    messages: [
      {
        key: event.orderId,
        value: JSON.stringify(event),
        headers: {
          "event-type": "saga.order-cancelled",
          source: "saga-orchestrator",
        },
      },
    ],
  });

  console.log(`📤 Published saga.order-cancelled: ${event.orderId}`);
}
