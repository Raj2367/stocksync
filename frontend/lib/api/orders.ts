import { apiFetch } from "./client";

export type OrderStatus = "PENDING" | "CONFIRMED" | "CANCELLED";

export type SagaStatus =
  | "AWAITING_INVENTORY"
  | "AWAITING_PAYMENT"
  | "COMPLETED"
  | "CANCELLED";

export interface Order {
  orderId: string;
  tenantId: string;
  productId: string;
  quantity: number;
  customerEmail: string | null;
  status: OrderStatus;
  sagaStatus: SagaStatus;
  paymentId: string | null;
  paymentMode: string;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderRequest {
  productId: string;
  quantity: number;
  customerEmail?: string;
  paymentMode?: string;
}

export interface CreateOrderResponse {
  message: string;
  order: {
    orderId: string;
    productId: string;
    quantity: number;
    status: OrderStatus;
    sagaStatus: SagaStatus;
    createdAt: string;
  };
}

export interface ListOrdersResponse {
  count: number;
  orders: Order[];
}

export async function listOrders(): Promise<ListOrdersResponse> {
  return apiFetch<ListOrdersResponse>("/orders");
}

export async function getOrder(orderId: string): Promise<Order> {
  return apiFetch<Order>(`/orders/${orderId}`);
}

export async function createOrder(
  request: CreateOrderRequest,
): Promise<CreateOrderResponse> {
  return apiFetch<CreateOrderResponse>("/orders", {
    method: "POST",
    body: JSON.stringify(request),
  });
}
