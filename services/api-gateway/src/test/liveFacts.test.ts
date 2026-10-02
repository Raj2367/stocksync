import axios from "axios";
import { fetchLiveOrderFacts } from "../rag/liveFacts";

jest.mock("axios");

const mockedAxios = axios as jest.Mocked<typeof axios>;
const actualAxios = jest.requireActual("axios") as typeof axios;

describe("fetchLiveOrderFacts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.isAxiosError.mockImplementation(actualAxios.isAxiosError as any);
  });

  it("both requests return 2xx: both results are found with response data preserved", async () => {
    mockedAxios.get.mockImplementation((url: string) => {
      if (url.includes("/orders/")) {
        return Promise.resolve({ data: { orderId: "ord-1", status: "paid" } });
      }
      if (url.includes("/sagas/")) {
        return Promise.resolve({ data: { orderId: "ord-1", status: "completed" } });
      }
      return Promise.resolve({ data: {} });
    });

    const result = await fetchLiveOrderFacts("tenant-acme", "ord-1");

    expect(result.order).toEqual({ kind: "found", data: { orderId: "ord-1", status: "paid" } });
    expect(result.saga).toEqual({ kind: "found", data: { orderId: "ord-1", status: "completed" } });
  });

  it("both requests return 404: both results are not_found", async () => {
    const err = Object.assign(new Error("Not Found"), {
      isAxiosError: true,
      response: { status: 404 },
    });
    mockedAxios.get.mockRejectedValue(err);

    const result = await fetchLiveOrderFacts("tenant-acme", "missing-1");

    expect(result.order).toEqual({ kind: "not_found" });
    expect(result.saga).toEqual({ kind: "not_found" });
  });

  it("both requests return 500: both results are unavailable", async () => {
    const err = Object.assign(new Error("Server Error"), { response: { status: 500 } });
    mockedAxios.get.mockRejectedValue(err);

    const result = await fetchLiveOrderFacts("tenant-acme", "ord-1");

    expect(result.order).toEqual({ kind: "unavailable" });
    expect(result.saga).toEqual({ kind: "unavailable" });
  });

  it("order rejects without response while saga returns 2xx: order unavailable, saga found", async () => {
    mockedAxios.get.mockImplementation((url: string) => {
      if (url.includes("/orders/")) {
        return Promise.reject(Object.assign(new Error("timeout"), { code: "ECONNABORTED" }));
      }
      if (url.includes("/sagas/")) {
        return Promise.resolve({ data: { sagaId: "s-1" } });
      }
      return Promise.resolve({ data: {} });
    });

    const result = await fetchLiveOrderFacts("tenant-acme", "ord-1");

    expect(result.order).toEqual({ kind: "unavailable" });
    expect(result.saga).toEqual({ kind: "found", data: { sagaId: "s-1" } });
  });

  it("order returns 2xx while saga returns 404: order found, saga not_found", async () => {
    mockedAxios.get.mockImplementation((url: string) => {
      if (url.includes("/orders/")) {
        return Promise.resolve({ data: { orderId: "ord-1" } });
      }
      if (url.includes("/sagas/")) {
        const err = Object.assign(new Error("Not Found"), {
          isAxiosError: true,
          response: { status: 404 },
        });
        return Promise.reject(err);
      }
      return Promise.resolve({ data: {} });
    });

    const result = await fetchLiveOrderFacts("tenant-acme", "ord-1");

    expect(result.order).toEqual({ kind: "found", data: { orderId: "ord-1" } });
    expect(result.saga).toEqual({ kind: "not_found" });
  });

  it("Order Service request includes X-Tenant-Id header", async () => {
    mockedAxios.get.mockResolvedValue({ data: {} });

    await fetchLiveOrderFacts("tenant-acme", "ord-1");

    const orderCall = mockedAxios.get.mock.calls.find(
      (c) => c[0].includes("/orders/"),
    );
    expect(orderCall).toBeDefined();
    expect(orderCall![1]).toMatchObject({
      headers: { "X-Tenant-Id": "tenant-acme" },
    });
  });

  it("Saga Service request includes X-Tenant-Id header", async () => {
    mockedAxios.get.mockResolvedValue({ data: {} });

    await fetchLiveOrderFacts("tenant-acme", "ord-1");

    const sagaCall = mockedAxios.get.mock.calls.find(
      (c) => c[0].includes("/sagas/"),
    );
    expect(sagaCall).toBeDefined();
    expect(sagaCall![1]).toMatchObject({
      headers: { "X-Tenant-Id": "tenant-acme" },
    });
  });

  it("both axios.get calls are initiated before either request resolves", async () => {
    const callOrder: string[] = [];
    let resolveOrder: (() => void) | undefined;
    let resolveSaga: (() => void) | undefined;

    mockedAxios.get.mockImplementation((url: string) => {
      callOrder.push(url);

      if (url.includes("/orders/")) {
        return new Promise((resolve) => {
          resolveOrder = () =>
            resolve({ data: { orderId: "ord-1" } });
        });
      }
      if (url.includes("/sagas/")) {
        return new Promise((resolve) => {
          resolveSaga = () =>
            resolve({ data: { sagaId: "s-1" } });
        });
      }
      return Promise.resolve({ data: {} });
    });

    const resultPromise = fetchLiveOrderFacts("tenant-acme", "ord-1");

    expect(callOrder).toEqual([
      expect.stringContaining("/orders/"),
      expect.stringContaining("/sagas/"),
    ]);

    resolveOrder!();
    resolveSaga!();

    const result = await resultPromise;
    expect(result.order).toEqual({ kind: "found", data: { orderId: "ord-1" } });
    expect(result.saga).toEqual({ kind: "found", data: { sagaId: "s-1" } });
  });

  it("unexpected axios errors classify as unavailable", async () => {
    mockedAxios.get.mockRejectedValue(new Error("Something unexpected"));

    const result = await fetchLiveOrderFacts("tenant-acme", "ord-1");

    expect(result.order).toEqual({ kind: "unavailable" });
    expect(result.saga).toEqual({ kind: "unavailable" });
  });

  it("axios error without response (network error) classifies as unavailable", async () => {
    mockedAxios.get.mockRejectedValue(new Error("connect ECONNREFUSED"));

    const result = await fetchLiveOrderFacts("tenant-acme", "ord-1");

    expect(result.order).toEqual({ kind: "unavailable" });
    expect(result.saga).toEqual({ kind: "unavailable" });
  });

  it("non-404 HTTP status (e.g. 403) classifies as unavailable", async () => {
    const err = Object.assign(new Error("Forbidden"), { response: { status: 403 } });
    mockedAxios.get.mockRejectedValue(err);

    const result = await fetchLiveOrderFacts("tenant-acme", "ord-1");

    expect(result.order).toEqual({ kind: "unavailable" });
    expect(result.saga).toEqual({ kind: "unavailable" });
  });

  it("timeout config is set to 3000ms on the Order request", async () => {
    mockedAxios.get.mockResolvedValue({ data: {} });

    await fetchLiveOrderFacts("tenant-acme", "ord-1");

    const orderCall = mockedAxios.get.mock.calls.find(
      (c) => c[0].includes("/orders/"),
    );
    expect(orderCall![1]).toMatchObject({ timeout: 3000 });
  });

  it("timeout config is set to 3000ms on the Saga request", async () => {
    mockedAxios.get.mockResolvedValue({ data: {} });

    await fetchLiveOrderFacts("tenant-acme", "ord-1");

    const sagaCall = mockedAxios.get.mock.calls.find(
      (c) => c[0].includes("/sagas/"),
    );
    expect(sagaCall![1]).toMatchObject({ timeout: 3000 });
  });

  it("Order Service URL is used for the order fetch", async () => {
    mockedAxios.get.mockResolvedValue({ data: {} });

    await fetchLiveOrderFacts("tenant-beta", "ord-1");

    const orderCall = mockedAxios.get.mock.calls.find(
      (c) => c[0].includes("/orders/"),
    );
    expect(orderCall![0]).toBe(
      "http://order-service:3001/orders/ord-1",
    );
  });

  it("Saga Service URL is used for the saga fetch", async () => {
    mockedAxios.get.mockResolvedValue({ data: {} });

    await fetchLiveOrderFacts("tenant-beta", "ord-1");

    const sagaCall = mockedAxios.get.mock.calls.find(
      (c) => c[0].includes("/sagas/"),
    );
    expect(sagaCall![0]).toBe(
      "http://saga-orchestrator:3004/sagas/ord-1",
    );
  });
});
