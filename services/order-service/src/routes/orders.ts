import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import Order from "../models/Order";
import { publishOrderCreated } from "../events/producer";

const router = Router();

// POST /orders — Create a new order
router.post("/", async (req, res) => {
  try {
    const tenantId = req.header("X-Tenant-Id");
    if (!tenantId) {
      return res
        .status(400)
        .json({ error: "X-Tenant-Id header is required" });
    }

    const { productId, quantity, customerEmail, paymentMode } = req.body;

    // Basic validation
    if (!productId || !quantity || quantity < 1) {
      return res
        .status(400)
        .json({ error: "productId and quantity (>=1) are required" });
    }

    const order = new Order({
      orderId: uuidv4(),
      tenantId,
      productId,
      quantity,
      customerEmail: customerEmail || null,
      paymentMode: paymentMode || "UNPAID",
      status: "PENDING",
      sagaStatus: "AWAITING_INVENTORY",
    });

    await order.save();

    // Publish event to Kafka
    await publishOrderCreated({
      orderId: order.orderId,
      tenantId: order.tenantId,
      productId: order.productId,
      quantity: order.quantity,
      customerEmail: order.customerEmail,
      paymentMode: order.paymentMode,
      timestamp: new Date().toISOString(),
    });

    res.status(201).json({
      message: "Order created successfully",
      order: {
        orderId: order.orderId,
        productId: order.productId,
        quantity: order.quantity,
        status: order.status,
        sagaStatus: order.sagaStatus,
        createdAt: order.createdAt,
      },
    });
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({ error: "Failed to create order" });
  }
});

// GET /orders/:orderId — Get order by ID
router.get("/:orderId", async (req, res) => {
  try {
    const tenantId = req.header("X-Tenant-Id");
    if (!tenantId) {
      return res
        .status(400)
        .json({ error: "X-Tenant-Id header is required" });
    }

    const order = await Order.findOne({ orderId: req.params.orderId, tenantId }).lean();
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    res.json(order);
  } catch (error) {
    console.error("Error fetching order:", error);
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

// GET /orders — List all orders (with limit)
router.get("/", async (req, res) => {
  try {
    const tenantId = req.header("X-Tenant-Id");
    if (!tenantId) {
      return res
        .status(400)
        .json({ error: "X-Tenant-Id header is required" });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const orders = await Order.find({ tenantId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json({ count: orders.length, orders });
  } catch (error) {
    console.error("Error listing orders:", error);
    res.status(500).json({ error: "Failed to list orders" });
  }
});

export default router;
