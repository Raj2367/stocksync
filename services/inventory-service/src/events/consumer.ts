import { Kafka, Consumer } from "kafkajs";
import { query, getClient } from "../db/connection";
import {
  publishInventoryReserved,
  publishInventoryReservationFailed,
} from "./producer";

const KAFKA_BROKER = process.env.KAFKA_BROKER || "kafka:29092";

const kafka = new Kafka({
  clientId: "inventory-service",
  brokers: [KAFKA_BROKER],
  retry: {
    initialRetryTime: 300,
    retries: 10,
  },
});

let consumer: Consumer;

interface OrderCreatedEvent {
  orderId: string;
  productId: string;
  quantity: number;
  customerEmail: string | null;
  timestamp: string;
}

export async function startConsumer(): Promise<void> {
  consumer = kafka.consumer({ groupId: "inventory-service-group" });

  await consumer.connect();
  console.log("✅ Kafka consumer connected");

  await consumer.subscribe({ topic: "order.created", fromBeginning: false });
  console.log("📡 Subscribed to order.created");

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const event: OrderCreatedEvent = JSON.parse(message.value!.toString());
        console.log(`📥 Received order.created: ${event.orderId}`);

        await handleOrderCreated(event);
      } catch (error) {
        console.error("Error processing message:", error);
        // In production, you'd send to a dead-letter queue here
      }
    },
  });
}

export async function stopConsumer(): Promise<void> {
  if (consumer) {
    await consumer.disconnect();
    console.log("🔌 Kafka consumer disconnected");
  }
}

async function handleOrderCreated(event: OrderCreatedEvent): Promise<void> {
  const client = await getClient();

  try {
    await client.query("BEGIN");

    // Lock the product row for update (prevents race conditions)
    const productResult = await client.query(
      "SELECT id, stock_quantity, reserved_quantity FROM products WHERE sku = $1 FOR UPDATE",
      [event.productId],
    );

    if (productResult.rows.length === 0) {
      await client.query("ROLLBACK");
      console.log(`❌ Product not found: ${event.productId}`);
      await publishInventoryReservationFailed({
        orderId: event.orderId,
        productId: event.productId,
        quantity: event.quantity,
        reason: "PRODUCT_NOT_FOUND",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const product = productResult.rows[0];
    const available = product.stock_quantity - product.reserved_quantity;

    if (available < event.quantity) {
      await client.query("ROLLBACK");
      console.log(
        `❌ Insufficient stock for ${event.productId}: need ${event.quantity}, have ${available}`,
      );
      await publishInventoryReservationFailed({
        orderId: event.orderId,
        productId: event.productId,
        quantity: event.quantity,
        reason: "INSUFFICIENT_STOCK",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Reserve the stock
    await client.query(
      "UPDATE products SET reserved_quantity = reserved_quantity + $1 WHERE id = $2",
      [event.quantity, product.id],
    );

    // Record the reservation
    await client.query(
      "INSERT INTO inventory_reservations (order_id, product_id, quantity, status) VALUES ($1, $2, $3, $4)",
      [event.orderId, product.id, event.quantity, "reserved"],
    );

    await client.query("COMMIT");

    console.log(
      `✅ Reserved ${event.quantity} units of ${event.productId} for order ${event.orderId}`,
    );

    // Publish success event
    await publishInventoryReserved({
      orderId: event.orderId,
      productId: event.productId,
      quantity: event.quantity,
      reservationId: product.id,
      timestamp: new Date().toISOString(),
    });

    // Invalidate cache for this product
    try {
      const { getRedisClient } = await import("../db/redis");
      const redis = getRedisClient();
      await redis.del(`inventory:${event.productId}`);
      console.log(`🗑️ Cache invalidated for ${event.productId}`);
    } catch (e) {
      console.warn("Failed to invalidate cache:", e);
    }
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error handling order.created:", error);
    throw error;
  } finally {
    client.release();
  }
}
