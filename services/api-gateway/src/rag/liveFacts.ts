import axios from "axios";

export type FactFetch =
  | { kind: "found"; data: Record<string, unknown> }
  | { kind: "not_found" }
  | { kind: "unavailable" };

export interface LiveOrderFacts {
  order: FactFetch;
  saga: FactFetch;
}

const ORDER_SERVICE_URL =
  process.env.ORDER_SERVICE_URL || "http://order-service:3001";

const SAGA_SERVICE_URL =
  process.env.SAGA_SERVICE_URL || "http://saga-orchestrator:3004";

const FETCH_TIMEOUT_MS = 3000;

async function fetchOne(
  url: string,
  tenantId: string,
): Promise<FactFetch> {
  try {
    const response = await axios.get(url, {
      timeout: FETCH_TIMEOUT_MS,
      headers: {
        "X-Tenant-Id": tenantId,
      },
    });

    return {
      kind: "found",
      data: response.data,
    };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return { kind: "not_found" };
    }

    return { kind: "unavailable" };
  }
}

export async function fetchLiveOrderFacts(
  tenantId: string,
  orderId: string,
): Promise<LiveOrderFacts> {
  const [order, saga] = await Promise.all([
    fetchOne(`${ORDER_SERVICE_URL}/orders/${orderId}`, tenantId),
    fetchOne(`${SAGA_SERVICE_URL}/sagas/${orderId}`, tenantId),
  ]);

  return { order, saga };
}
