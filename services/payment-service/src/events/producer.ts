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

// Consolidated topic for all payment outcome events. Both
// payment.processed and payment.failed flows now publish here,
// distinguished by the preserved "event-type" header.
const PAYMENT_RESULT_TOPIC = "payment.result";

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
  tenantId: string;
  productId: string;
  quantity: number;
  paymentMode: string;
  paymentId: string;
  amount: number;
  timestamp: string;
}

export interface PaymentFailedEvent {
  orderId: string;
  tenantId: string;
  productId: string;
  quantity: number;
  paymentMode: string;
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
    topic: PAYMENT_RESULT_TOPIC,
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
    topic: PAYMENT_RESULT_TOPIC,
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
