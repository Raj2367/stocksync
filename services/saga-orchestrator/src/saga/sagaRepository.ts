import Saga, { ISaga, SagaStatus, SagaStep } from "../models/Saga";

export { SagaStatus, SagaStep };

export interface SagaRecord {
  orderId: string;
  tenantId: string;
  productId: string;
  quantity: number;
  customerEmail: string | null;
  status: SagaStatus;
  paymentId?: string | null;
  failureReason?: string | null;
  steps: SagaStep[];
  createdAt: Date;
  updatedAt: Date;
}

function toRecord(doc: ISaga | null): SagaRecord | null {
  if (!doc) return null;
  return doc.toObject() as SagaRecord;
}

export async function createSaga(
  tenantId: string,
  orderId: string,
  productId: string,
  quantity: number,
  customerEmail: string | null,
): Promise<SagaRecord> {
  const now = new Date().toISOString();
  const saga = new Saga({
    tenantId,
    orderId,
    productId,
    quantity,
    customerEmail,
    status: "AWAITING_INVENTORY",
    steps: [
      {
        action: "ORDER_CREATED",
        status: "success",
        timestamp: now,
      },
    ],
  });
  await saga.save();
  return toRecord(saga as ISaga)!;
}

export async function getSaga(
  tenantId: string,
  orderId: string,
): Promise<SagaRecord | null> {
  const saga = await Saga.findOne({ tenantId, orderId }).lean().exec();
  return (saga as unknown) as SagaRecord | null;
}

export async function getAllSagas(tenantId: string): Promise<SagaRecord[]> {
  const sagas = await Saga.find({ tenantId })
    .sort({ createdAt: -1 })
    .lean()
    .exec();
  return (sagas as unknown) as SagaRecord[];
}

export async function updateSaga(
  tenantId: string,
  orderId: string,
  updates: Partial<SagaRecord>,
): Promise<SagaRecord | null> {
  const saga = await Saga.findOneAndUpdate(
    { tenantId, orderId },
    { ...updates },
    { new: true, runValidators: true },
  )
    .lean()
    .exec();
  return (saga as unknown) as SagaRecord | null;
}

export async function addSagaStep(
  tenantId: string,
  orderId: string,
  step: SagaStep,
): Promise<void> {
  await Saga.updateOne(
    { tenantId, orderId },
    { $push: { steps: step }, updatedAt: new Date() },
  ).exec();
}
