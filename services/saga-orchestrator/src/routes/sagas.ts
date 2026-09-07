import { Router } from "express";
import { getSaga, getAllSagas } from "../saga/store";

const router = Router();

// GET /sagas — List all sagas
router.get("/", (req, res) => {
  const sagas = getAllSagas();
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

// GET /sagas/:orderId — Get specific saga
router.get("/:orderId", (req, res) => {
  const saga = getSaga(req.params.orderId);
  if (!saga) {
    return res.status(404).json({ error: "Saga not found" });
  }
  res.json(saga);
});

export default router;
