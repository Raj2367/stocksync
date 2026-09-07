import { Kafka, Producer } from "kafkajs";

const KAFKA_BROKER = process.env.KAFKA_BROKER || "kafka:29092";

const kafka = new Kafka({
  clientId: "payment-service-producer",
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
  console.log("✅ Payment producer connected");
}

export async function disconnectProducer(): Promise<void> {
  if (producer) {
    await producer.disconnect();
  }
}

export interface PaymentProcessedEvent {
  orderId: string;
  productId: string;
  quantity: number;
  paymentId: string;
  amount: number;
  timestamp: string;
}

export interface PaymentFailedEvent {
  orderId: string;
  productId: string;
  quantity: number;
  reason: string;
  timestamp: string;
}

export async function publishPaymentProcessed(
  event: PaymentProcessedEvent,
): Promise<void> {
  if (!producer) {
    await connectProducer();
  }

  await producer.send({
    topic: "payment.processed",
    messages: [
      {
        key: event.orderId,
        value: JSON.stringify(event),
        headers: {
          "event-type": "payment.processed",
          source: "payment-service",
        },
      },
    ],
  });

  console.log(`📤 Published payment.processed: ${event.orderId}`);
}

export async function publishPaymentFailed(
  event: PaymentFailedEvent,
): Promise<void> {
  if (!producer) {
    await connectProducer();
  }

  await producer.send({
    topic: "payment.failed",
    messages: [
      {
        key: event.orderId,
        value: JSON.stringify(event),
        headers: {
          "event-type": "payment.failed",
          source: "payment-service",
        },
      },
    ],
  });

  console.log(`📤 Published payment.failed: ${event.orderId}`);
}
