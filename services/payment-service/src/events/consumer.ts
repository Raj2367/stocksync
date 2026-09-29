import { Kafka, Consumer, Message } from "kafkajs";
import { publishPaymentProcessed, publishPaymentFailed } from "./producer";
import { DEMO_MODE } from "../config";

const KAFKA_BROKER = process.env.KAFKA_BROKER || "kafka:29092";

const kafka = new Kafka({
  clientId: "payment-service",
  brokers: [KAFKA_BROKER],
  retry: {
    initialRetryTime: 300,
    retries: 10,
  },
});

let consumer: Consumer;

interface InventoryReservedEvent {
  orderId: string;
  tenantId: string;
  productId: string;
  quantity: number;
  paymentMode: string;
  reservationId: number;
  timestamp: string;
}

export async function startConsumer(): Promise<void> {
  consumer = kafka.consumer({ groupId: "payment-service-group" });

  await consumer.connect();
  console.log("✅ Payment consumer connected");

  await consumer.subscribe({
    topic: "inventory.result",
    fromBeginning: false,
  });
  console.log("📡 Subscribed to inventory.result");

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        await processInventoryMessage(message);
      } catch (error) {
        console.error("Error processing payment:", error);
      }
    },
  });
}

export async function stopConsumer(): Promise<void> {
  if (consumer) {
    await consumer.disconnect();
    console.log("🔌 Payment consumer disconnected");
  }
}

// Dispatches a single inventory.result message. Only the
// "inventory.reserved" event-type triggers payment handling; other
// events arriving on the same topic (e.g. inventory.reservation-failed)
// are skipped without touching payment logic.
export async function processInventoryMessage(
  message: Message,
): Promise<void> {
  const eventType = message.headers?.["event-type"]?.toString();
  if (eventType !== "inventory.reserved") {
    console.log(`⏭️ Skipping inventory.result event (event-type: ${eventType})`);
    return;
  }

  const event: InventoryReservedEvent = JSON.parse(
    message.value!.toString(),
  );
  console.log(`📥 Received inventory.reserved: ${event.orderId}`);

  await handlePayment(event);
}

export async function handlePayment(event: InventoryReservedEvent): Promise<void> {
  // Simulate payment processing delay (100-500ms)
  const delay = Math.floor(Math.random() * 400) + 100;
  await sleep(delay);

  // DEMO_MODE uses a deterministic decision based on paymentMode:
  // PREPAID orders are always approved (funds already collected), any other
  // mode (e.g. UNPAID) is declined (no funds captured). Outside DEMO_MODE
  // the original randomized ~70% success rate is preserved exactly.
  const isApproved = DEMO_MODE
    ? event.paymentMode === "PREPAID"
    : Math.random() < 0.7;

  if (isApproved) {
    const paymentId = `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    console.log(
      `✅ Payment APPROVED for order ${event.orderId} (paymentId: ${paymentId})`,
    );

    await publishPaymentProcessed({
      orderId: event.orderId,
      tenantId: event.tenantId,
      productId: event.productId,
      quantity: event.quantity,
      paymentMode: event.paymentMode,
      paymentId: paymentId,
      amount: calculateAmount(event.productId, event.quantity),
      timestamp: new Date().toISOString(),
    });
  } else {
    const failureReason = getRandomFailureReason();

    console.log(
      `❌ Payment DECLINED for order ${event.orderId}: ${failureReason}`,
    );

    await publishPaymentFailed({
      orderId: event.orderId,
      tenantId: event.tenantId,
      productId: event.productId,
      quantity: event.quantity,
      paymentMode: event.paymentMode,
      reason: failureReason,
      timestamp: new Date().toISOString(),
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateAmount(productId: string, quantity: number): number {
  // Mock pricing
  const prices: Record<string, number> = {
    "PROD-001": 29.99, // Wireless Mouse
    "PROD-002": 89.99, // Mechanical Keyboard
    "PROD-003": 49.99, // USB-C Hub
    "PROD-004": 129.99, // Webcam 4K
    "PROD-005": 39.99, // Monitor Stand
  };
  const unitPrice = prices[productId] || 19.99;
  return parseFloat((unitPrice * quantity).toFixed(2));
}

function getRandomFailureReason(): string {
  const reasons = [
    "INSUFFICIENT_FUNDS",
    "CARD_EXPIRED",
    "BANK_DECLINED",
    "FRAUD_CHECK_FAILED",
    "CVV_MISMATCH",
  ];
  return reasons[Math.floor(Math.random() * reasons.length)];
}
