jest.mock("../../events/producer");
jest.mock("../../db/connection");

import { handleOrderCreated } from "../../events/consumer";
import {
  publishInventoryReserved,
  publishInventoryReservationFailed,
} from "../../events/producer";
import { getClient } from "../../db/connection";

const mockedPublishInventoryReserved = publishInventoryReserved as jest.MockedFunction<typeof publishInventoryReserved>;
const mockedPublishInventoryReservationFailed = publishInventoryReservationFailed as jest.MockedFunction<typeof publishInventoryReservationFailed>;
const mockedGetClient = getClient as jest.MockedFunction<typeof getClient>;

interface MockClient {
  query: jest.Mock;
  release: jest.Mock;
}

function createMockClient(): MockClient {
  return {
    query: jest.fn(),
    release: jest.fn(),
  };
}

function makeEvent(overrides: Partial<{
  orderId: string;
  tenantId: string;
  productId: string;
  quantity: number;
  customerEmail: string | null;
  paymentMode: string;
  timestamp: string;
}> = {}) {
  return {
    orderId: "ORD-001",
    tenantId: "tenant-acme",
    productId: "PROD-001",
    quantity: 2,
    customerEmail: "test@example.com",
    paymentMode: "PREPAID",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe("Inventory Tenant Event Propagation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPublishInventoryReserved.mockResolvedValue(undefined);
    mockedPublishInventoryReservationFailed.mockResolvedValue(undefined);
  });

  describe("inventory.reserved", () => {
    it("should propagate tenantId and paymentMode from order.created", async () => {
      const mockClient = createMockClient();
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 1, stock_quantity: 100, reserved_quantity: 0 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      mockedGetClient.mockResolvedValue(mockClient as any);

      await handleOrderCreated(makeEvent());

      expect(mockedPublishInventoryReserved).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: "ORD-001",
          tenantId: "tenant-acme",
          productId: "PROD-001",
          quantity: 2,
          paymentMode: "PREPAID",
          reservationId: 1,
        })
      );
    });

    it("should preserve existing fields in inventory.reserved", async () => {
      const mockClient = createMockClient();
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 1, stock_quantity: 100, reserved_quantity: 0 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      mockedGetClient.mockResolvedValue(mockClient as any);

      await handleOrderCreated(makeEvent());

      const event = mockedPublishInventoryReserved.mock.calls[0][0];
      expect(event.orderId).toBe("ORD-001");
      expect(event.productId).toBe("PROD-001");
      expect(event.quantity).toBe(2);
      expect(event.reservationId).toBe(1);
      expect(event.timestamp).toBeDefined();
    });

    it("should update stock and record reservation on success", async () => {
      const mockClient = createMockClient();
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 1, stock_quantity: 100, reserved_quantity: 0 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      mockedGetClient.mockResolvedValue(mockClient as any);

      await handleOrderCreated(makeEvent({ quantity: 3 }));

      expect(mockClient.query).toHaveBeenCalledWith(
        "UPDATE products SET reserved_quantity = reserved_quantity + $1 WHERE id = $2",
        [3, 1],
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        "INSERT INTO inventory_reservations (order_id, product_id, quantity, status) VALUES ($1, $2, $3, $4)",
        ["ORD-001", 1, 3, "reserved"],
      );
    });
  });

  describe("inventory.reservation-failed (INSUFFICIENT_STOCK)", () => {
    it("should propagate tenantId and paymentMode from order.created", async () => {
      const mockClient = createMockClient();
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 1, stock_quantity: 5, reserved_quantity: 0 }] });
      mockedGetClient.mockResolvedValue(mockClient as any);

      await handleOrderCreated(makeEvent({ quantity: 10 }));

      expect(mockedPublishInventoryReservationFailed).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: "ORD-001",
          tenantId: "tenant-acme",
          productId: "PROD-001",
          quantity: 10,
          paymentMode: "PREPAID",
          reason: "INSUFFICIENT_STOCK",
        })
      );
    });

    it("should not reserve stock when insufficient", async () => {
      const mockClient = createMockClient();
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 1, stock_quantity: 5, reserved_quantity: 0 }] });
      mockedGetClient.mockResolvedValue(mockClient as any);

      await handleOrderCreated(makeEvent({ quantity: 10 }));

      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
      expect(mockClient.query).not.toHaveBeenCalledWith(
        "UPDATE products SET reserved_quantity = reserved_quantity + $1 WHERE id = $2",
        expect.anything(),
      );
    });
  });

  describe("inventory.reservation-failed (PRODUCT_NOT_FOUND)", () => {
    it("should propagate tenantId and paymentMode from order.created", async () => {
      const mockClient = createMockClient();
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      mockedGetClient.mockResolvedValue(mockClient as any);

      await handleOrderCreated(makeEvent());

      expect(mockedPublishInventoryReservationFailed).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: "ORD-001",
          tenantId: "tenant-acme",
          productId: "PROD-001",
          quantity: 2,
          paymentMode: "PREPAID",
          reason: "PRODUCT_NOT_FOUND",
        })
      );
    });
  });
});
