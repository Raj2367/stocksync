import { Kafka, Producer } from "kafkajs";

const KAFKA_BROKER = process.env.KAFKA_BROKER || "kafka:29092";

const kafka = new Kafka({
  clientId: "inventory-service-producer",
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
  console.log("✅ Inventory producer connected");
}

export async function disconnectProducer(): Promise<void> {
  if (producer) {
    await producer.disconnect();
  }
}

export interface InventoryReservedEvent {
  orderId: string;
  productId: string;
  quantity: number;
  reservationId: number;
  timestamp: string;
}

export interface InventoryReservationFailedEvent {
  orderId: string;
  productId: string;
  quantity: number;
  reason: string;
  timestamp: string;
}

export async function publishInventoryReserved(
  event: InventoryReservedEvent,
): Promise<void> {
  if (!producer) {
    await connectProducer();
  }

  await producer.send({
    topic: "inventory.reserved",
    messages: [
      {
        key: event.orderId,
        value: JSON.stringify(event),
        headers: {
          "event-type": "inventory.reserved",
          source: "inventory-service",
        },
      },
    ],
  });

  console.log(`📤 Published inventory.reserved: ${event.orderId}`);
}

export async function publishInventoryReservationFailed(
  event: InventoryReservationFailedEvent,
): Promise<void> {
  if (!producer) {
    await connectProducer();
  }

  await producer.send({
    topic: "inventory.reservation-failed",
    messages: [
      {
        key: event.orderId,
        value: JSON.stringify(event),
        headers: {
          "event-type": "inventory.reservation-failed",
          source: "inventory-service",
        },
      },
    ],
  });

  console.log(`📤 Published inventory.reservation-failed: ${event.orderId}`);
}
