import { Router } from "express";
import { getSaga, getAllSagas } from "../saga/store";

const router = Router();

// GET /sagas — List sagas for the tenant identified by X-Tenant-Id
router.get("/", async (req, res) => {
  const tenantId = req.header("X-Tenant-Id");
  if (!tenantId) {
    return res.status(400).json({ error: "X-Tenant-Id header is required" });
  }
  const sagas = await getAllSagas(tenantId);
  res.json({
    count: sagas.length,
    sagas: sagas.map((s) => ({
      orderId: s.orderId,
      status: s.status,
      productId: s.productId,
      quantity: s.quantity,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      steps: s.steps,
    })),
  });
});

// GET /sagas/:orderId — Get specific saga scoped to the tenant in X-Tenant-Id.
// The store performs a tenant-scoped lookup, so a Saga belonging to another
// tenant is indistinguishable from a non-existent Saga (404, never 403).
router.get("/:orderId", async (req, res) => {
  const tenantId = req.header("X-Tenant-Id");
  if (!tenantId) {
    return res.status(400).json({ error: "X-Tenant-Id header is required" });
  }
  const saga = await getSaga(req.params.orderId, tenantId);
  if (!saga) {
    return res.status(404).json({ error: "Saga not found" });
  }
  res.json(saga);
});

export default router;
