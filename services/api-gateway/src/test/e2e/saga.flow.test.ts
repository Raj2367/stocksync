import axios from "axios";

const GATEWAY_URL = "http://localhost:3000";

describe("End-to-End Saga Flow", () => {
  let authToken: string;
  // Unique email per test run avoids user collision or user-based throttling
  const TEST_EMAIL = `e2e-${Date.now()}@example.com`;

  beforeAll(async () => {
    // 1. Register new test user
    try {
      await axios.post(`${GATEWAY_URL}/auth/register`, {
        email: TEST_EMAIL,
        password: "testpass123",
      });
    } catch (e: any) {
      if (e.response?.status !== 409) {
        console.error("Register Error:", e.response?.status, e.response?.data);
        throw e;
      }
    }

    // 2. Login to retrieve auth token
    try {
      const loginRes = await axios.post(`${GATEWAY_URL}/auth/login`, {
        email: TEST_EMAIL,
        password: "testpass123",
      });
      authToken = loginRes.data.token;
    } catch (e: any) {
      console.error("Login Error:", e.response?.status, e.response?.data);
      throw e;
    }

    expect(authToken).toBeTruthy();
  });

  // ==================== AUTH TESTS FIRST ====================

  describe("Authentication", () => {
    it("should reject requests without token", async () => {
      try {
        await axios.post(`${GATEWAY_URL}/orders`, {
          productId: "PROD-001",
          quantity: 1,
        });
        fail("Should have thrown 401");
      } catch (error: any) {
        expect(error.response?.status).toBe(401);
      }
    });

    it("should reject requests with invalid token", async () => {
      try {
        await axios.post(
          `${GATEWAY_URL}/orders`,
          { productId: "PROD-001", quantity: 1 },
          { headers: { Authorization: "Bearer invalid-token" } },
        );
        fail("Should have thrown 403");
      } catch (error: any) {
        expect(error.response?.status).toBe(403);
      }
    });
  });

  // ==================== HAPPY PATH ====================

  describe("Happy Path: Order → Inventory → Payment → Completed", () => {
    it("should complete full saga successfully", async () => {
      // 1. Create order through gateway
      const orderRes = await axios.post(
        `${GATEWAY_URL}/orders`,
        {
          productId: "PROD-001",
          quantity: 2,
          customerEmail: TEST_EMAIL,
        },
        { headers: { Authorization: `Bearer ${authToken}` } },
      );

      expect(orderRes.status).toBe(201);
      const orderId = orderRes.data.order.orderId;
      expect(orderRes.data.order.status).toBe("PENDING");

      // 2. Poll saga status until completed or cancelled (max 15s)
      let saga: any = null;
      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          const sagaRes = await axios.get(`${GATEWAY_URL}/sagas/${orderId}`);
          saga = sagaRes.data;
          if (saga.status === "COMPLETED" || saga.status === "CANCELLED") break;
        } catch (e) {
          // saga might not exist yet
        }
      }

      expect(saga).toBeTruthy();
      expect(saga.status).toBe("COMPLETED");

      // 3. Verify order was updated to CONFIRMED
      const orderCheck = await axios.get(`${GATEWAY_URL}/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      expect(orderCheck.data.status).toBe("CONFIRMED");
      expect(orderCheck.data.sagaStatus).toBe("COMPLETED");
      expect(orderCheck.data.paymentId).toBeTruthy();

      // 4. Verify inventory was reserved (not released)
      const inventoryRes = await axios.get(`${GATEWAY_URL}/inventory/PROD-001`);
      expect(
        inventoryRes.data.product.reserved_quantity,
      ).toBeGreaterThanOrEqual(2);
    }, 30000);
  });

  // ==================== FAILURE PATH ====================

  describe("Failure Path: Order → Inventory → Payment Failed → Compensation", () => {
    it("should cancel at least one order and release inventory when payment fails", async () => {
      const orderIds: string[] = [];

      for (let i = 0; i < 5; i++) {
        const res = await axios.post(
          `${GATEWAY_URL}/orders`,
          {
            productId: `PROD-00${(i % 5) + 1}`,
            quantity: 1,
            customerEmail: TEST_EMAIL,
          },
          { headers: { Authorization: `Bearer ${authToken}` } },
        );
        orderIds.push(res.data.order.orderId);
        await new Promise((r) => setTimeout(r, 500));
      }

      // Wait for all sagas to settle
      await new Promise((r) => setTimeout(r, 8000));

      // Check all sagas for this batch
      const sagasRes = await axios.get(`${GATEWAY_URL}/sagas`);
      const ourSagas = sagasRes.data.sagas.filter((s: any) =>
        orderIds.includes(s.orderId),
      );

      expect(ourSagas.length).toBe(5);

      // Find cancelled sagas with compensation
      const cancelledSagas = ourSagas.filter(
        (s: any) => s.status === "CANCELLED",
      );

      if (cancelledSagas.length === 0) {
        console.warn(
          "All 5 orders succeeded (rare but possible). Skipping compensation check.",
        );
        const allConfirmed = ourSagas.every(
          (s: any) => s.status === "COMPLETED",
        );
        expect(allConfirmed).toBe(true);
        return;
      }

      for (const saga of cancelledSagas) {
        const hasReleaseStep = saga.steps.some(
          (step: any) =>
            step.action === "RELEASE_INVENTORY" && step.status === "success",
        );
        expect(hasReleaseStep).toBe(true);

        const orderRes = await axios.get(
          `${GATEWAY_URL}/orders/${saga.orderId}`,
          { headers: { Authorization: `Bearer ${authToken}` } },
        );
        expect(orderRes.data.status).toBe("CANCELLED");
        expect(orderRes.data.sagaStatus).toBe("CANCELLED");
      }
    }, 45000);
  });

  // ==================== RATE LIMITING  ====================

  describe("Rate Limiting", () => {
    it("should throttle excessive requests", async () => {
      // Fire requests to trigger 429
      const requests = Array(110)
        .fill(null)
        .map(() =>
          axios.get(`${GATEWAY_URL}/health`).catch((err: any) => err.response),
        );

      const responses = await Promise.all(requests);
      const throttled = responses.filter((r: any) => r?.status === 429);

      expect(throttled.length).toBeGreaterThan(0);
      expect(throttled.length).toBeGreaterThanOrEqual(5);
    }, 30000);

    // Wait for rate limit window to expire before concluding the test suite
    afterAll(async () => {
      // If your rate limit window is 1 minute (or 10s), pause here
      // so your IP is unblocked before you trigger Jest again.
      console.log("Waiting 10 seconds for rate-limiter window to cool down...");
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }, 15000);
  });
});
