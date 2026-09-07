export type SagaStatus =
  | "PENDING"
  | "AWAITING_INVENTORY"
  | "AWAITING_PAYMENT"
  | "COMPLETED"
  | "CANCELLING"
  | "CANCELLED";

export interface SagaStep {
  action: string;
  status: "success" | "failure" | "compensating";
  timestamp: string;
  details?: string;
}

export interface Saga {
  orderId: string;
  productId: string;
  quantity: number;
  customerEmail: string | null;
  status: SagaStatus;
  paymentId?: string;
  failureReason?: string;
  steps: SagaStep[];
  createdAt: string;
  updatedAt: string;
}

// In-memory store. In production, use Redis or PostgreSQL.
const sagaStore = new Map<string, Saga>();

export function createSaga(
  orderId: string,
  productId: string,
  quantity: number,
  customerEmail: string | null,
): Saga {
  const saga: Saga = {
    orderId,
    productId,
    quantity,
    customerEmail,
    status: "AWAITING_INVENTORY",
    steps: [
      {
        action: "ORDER_CREATED",
        status: "success",
        timestamp: new Date().toISOString(),
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  sagaStore.set(orderId, saga);
  return saga;
}

export function getSaga(orderId: string): Saga | undefined {
  return sagaStore.get(orderId);
}

export function getAllSagas(): Saga[] {
  return Array.from(sagaStore.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function updateSaga(
  orderId: string,
  updates: Partial<Saga>,
): Saga | undefined {
  const saga = sagaStore.get(orderId);
  if (!saga) return undefined;

  Object.assign(saga, updates, { updatedAt: new Date().toISOString() });
  sagaStore.set(orderId, saga);
  return saga;
}

export function addSagaStep(orderId: string, step: SagaStep): void {
  const saga = sagaStore.get(orderId);
  if (saga) {
    saga.steps.push(step);
    saga.updatedAt = new Date().toISOString();
  }
}
