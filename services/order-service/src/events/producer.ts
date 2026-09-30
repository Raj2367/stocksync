import { Producer } from "kafkajs";
import { createKafka } from "./kafka";

const kafka = createKafka("order-service");

let producer: Producer;

export async function connectKafka(): Promise<void> {
  producer = kafka.producer();
  await producer.connect();
  console.log("✅ Kafka producer connected");
}

export async function disconnectKafka(): Promise<void> {
  if (producer) {
    await producer.disconnect();
    console.log("🔌 Kafka producer disconnected");
  }
}

export interface OrderCreatedEvent {
  orderId: string;
  tenantId: string;
  productId: string;
  quantity: number;
  customerEmail: string | null;
  paymentMode: string;
  timestamp: string;
}

export async function publishOrderCreated(
  event: OrderCreatedEvent,
): Promise<void> {
  if (!producer) {
    throw new Error("Kafka producer not connected");
  }

  await producer.send({
    topic: "order.created",
    messages: [
      {
        key: event.orderId,
        value: JSON.stringify(event),
        headers: {
          "event-type": "order.created",
          source: "order-service",
          timestamp: event.timestamp,
        },
      },
    ],
  });

  console.log(`📤 Published order.created: ${event.orderId}`);
}
