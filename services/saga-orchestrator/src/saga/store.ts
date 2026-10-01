import * as sagaRepository from "./sagaRepository";
import type { SagaRecord, SagaStatus, SagaStep } from "./sagaRepository";

export type Saga = SagaRecord;
export type { SagaStatus, SagaStep };

const DEFAULT_TENANT_ID = "";

export async function createSaga(
  orderId: string,
  productId: string,
  quantity: number,
  customerEmail: string | null,
  tenantId: string = DEFAULT_TENANT_ID,
): Promise<Saga> {
  const record = await sagaRepository.createSaga(
    tenantId,
    orderId,
    productId,
    quantity,
    customerEmail,
  );
  return record;
}

export async function getSaga(
  orderId: string,
  tenantId: string = DEFAULT_TENANT_ID,
): Promise<Saga | null> {
  return sagaRepository.getSaga(tenantId, orderId);
}

export async function getAllSagas(
  tenantId: string = DEFAULT_TENANT_ID,
): Promise<Saga[]> {
  return sagaRepository.getAllSagas(tenantId);
}

export async function updateSaga(
  orderId: string,
  updates: Partial<Saga>,
  tenantId: string = DEFAULT_TENANT_ID,
): Promise<Saga | null> {
  return sagaRepository.updateSaga(tenantId, orderId, updates);
}

export async function addSagaStep(
  orderId: string,
  step: SagaStep,
  tenantId: string = DEFAULT_TENANT_ID,
): Promise<void> {
  return sagaRepository.addSagaStep(tenantId, orderId, step);
}
