jest.mock("../db/mongo");
jest.mock("../db/redis");
jest.mock("../db/seed");
jest.mock("../rag/knowledgeSync");
jest.mock("../middleware/rateLimiter");
jest.mock("../routes/auth");
jest.mock("../routes/health");
jest.mock("../routes/orders");
jest.mock("../routes/inventory");
jest.mock("../routes/sagas");

import { startServer } from "../index";
import { connectMongo, disconnectMongo } from "../db/mongo";
import { seedUsers } from "../db/seed";
import { connectRedis, disconnectRedis } from "../db/redis";
import {
  syncKnowledgeCorpus,
  CorpusRootMissingError,
  CorpusEmptyError,
  CorpusStructureError,
} from "../rag/knowledgeSync";

const mockConnectMongo = connectMongo as jest.MockedFunction<typeof connectMongo>;
const mockSeedUsers = seedUsers as jest.MockedFunction<typeof seedUsers>;
const mockConnectRedis = connectRedis as jest.MockedFunction<typeof connectRedis>;
const mockSyncKnowledgeCorpus = syncKnowledgeCorpus as jest.MockedFunction<typeof syncKnowledgeCorpus>;

const mockListen = jest.fn();

jest.mock("express", () => {
  const mockApp = {
    use: jest.fn(),
    listen: (..._args: unknown[]) => {
      mockListen(..._args);
      return { close: jest.fn() };
    },
  };
  const mockRouter = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  };
  const express = jest.fn(() => mockApp);
  (express as any).Router = jest.fn(() => mockRouter);
  (express as any).json = jest.fn();
  (express as any).Request = {};
  (express as any).Response = {};
  (express as any).NextFunction = {};
  return express;
});

describe("startup sequence", () => {
  let originalExit: typeof process.exit;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConnectMongo.mockResolvedValue(undefined);
    mockSeedUsers.mockResolvedValue(undefined);
    mockSyncKnowledgeCorpus.mockResolvedValue(undefined);
    mockConnectRedis.mockResolvedValue(undefined);

    originalExit = process.exit;
    (process as any).exit = jest.fn();
  });

  afterEach(() => {
    process.exit = originalExit;
    jest.restoreAllMocks();
  });

  it("successful startup order", async () => {
    await startServer();

    expect(mockConnectMongo.mock.invocationCallOrder[0]).toBeLessThan(
      mockSeedUsers.mock.invocationCallOrder[0],
    );
    expect(mockSeedUsers.mock.invocationCallOrder[0]).toBeLessThan(
      mockSyncKnowledgeCorpus.mock.invocationCallOrder[0],
    );
    expect(mockSyncKnowledgeCorpus.mock.invocationCallOrder[0]).toBeLessThan(
      mockConnectRedis.mock.invocationCallOrder[0],
    );
    expect(mockConnectRedis.mock.invocationCallOrder[0]).toBeLessThan(
      mockListen.mock.invocationCallOrder[0],
    );
    expect(process.exit).not.toHaveBeenCalled();
  });

  it("listen does not happen until syncKnowledgeCorpus resolves, using a deferred promise", async () => {
    let resolveSync: () => void;
    const syncPromise = new Promise<void>((resolve) => {
      resolveSync = resolve;
    });
    mockSyncKnowledgeCorpus.mockReturnValue(syncPromise as Promise<void>);

    const promise = startServer();

    await Promise.resolve();
    await Promise.resolve();

    expect(mockListen).not.toHaveBeenCalled();

    resolveSync!();

    await promise;

    expect(mockListen).toHaveBeenCalled();
  });

  it("CorpusRootMissingError causes startup failure", async () => {
    mockSyncKnowledgeCorpus.mockRejectedValue(
      new CorpusRootMissingError("Corpus root does not exist: /fake/path"),
    );

    await startServer();

    expect(process.exit).toHaveBeenCalledWith(1);
    expect(mockConnectRedis).not.toHaveBeenCalled();
    expect(mockListen).not.toHaveBeenCalled();
  });

  it("CorpusEmptyError causes startup failure", async () => {
    mockSyncKnowledgeCorpus.mockRejectedValue(
      new CorpusEmptyError("No Markdown files found in corpus: /fake/path"),
    );

    await startServer();

    expect(process.exit).toHaveBeenCalledWith(1);
    expect(mockConnectRedis).not.toHaveBeenCalled();
    expect(mockListen).not.toHaveBeenCalled();
  });

  it("CorpusStructureError causes startup failure", async () => {
    mockSyncKnowledgeCorpus.mockRejectedValue(
      new CorpusStructureError(
        "Markdown file at corpus root is not allowed",
      ),
    );

    await startServer();

    expect(process.exit).toHaveBeenCalledWith(1);
    expect(mockConnectRedis).not.toHaveBeenCalled();
    expect(mockListen).not.toHaveBeenCalled();
  });

  it("generic sync/runtime error logs warning and startup continues", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation();
    mockSyncKnowledgeCorpus.mockRejectedValue(new Error("Gemini API error"));

    await startServer();

    expect(warnSpy).toHaveBeenCalledWith(
      "Knowledge corpus sync failed; continuing startup:",
      expect.any(Error),
    );
    warnSpy.mockRestore();

    expect(mockConnectRedis).toHaveBeenCalled();
    expect(mockListen).toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
  });

  it("connectMongo failure is fatal", async () => {
    mockConnectMongo.mockRejectedValue(new Error("MongoDB connection failed"));

    await startServer();

    expect(process.exit).toHaveBeenCalledWith(1);
    expect(mockSeedUsers).not.toHaveBeenCalled();
    expect(mockSyncKnowledgeCorpus).not.toHaveBeenCalled();
  });

  it("seedUsers failure is fatal", async () => {
    mockSeedUsers.mockRejectedValue(new Error("Seed failed"));

    await startServer();

    expect(process.exit).toHaveBeenCalledWith(1);
    expect(mockSyncKnowledgeCorpus).not.toHaveBeenCalled();
    expect(mockConnectRedis).not.toHaveBeenCalled();
  });

  it("connectRedis failure is fatal", async () => {
    mockConnectRedis.mockRejectedValue(new Error("Redis connection failed"));

    await startServer();

    expect(process.exit).toHaveBeenCalledWith(1);
    expect(mockListen).not.toHaveBeenCalled();
  });

  it("importing index.ts does not automatically start the server", () => {
    jest.resetModules();

    const mongoMock = {
      connectMongo: jest.fn().mockResolvedValue(undefined),
      disconnectMongo: jest.fn(),
    };
    const redisMock = {
      connectRedis: jest.fn().mockResolvedValue(undefined),
      disconnectRedis: jest.fn(),
    };
    const seedMock = { seedUsers: jest.fn().mockResolvedValue(undefined) };
    const knowledgeSyncMock = {
      syncKnowledgeCorpus: jest.fn().mockResolvedValue(undefined),
      CorpusRootMissingError: class extends Error {},
      CorpusEmptyError: class extends Error {},
      CorpusStructureError: class extends Error {},
    };
    const rateLimiterMock = { rateLimiter: jest.fn() };
    const expressListenJest = jest.fn();
    const expressMock = jest.fn(() => ({
      use: jest.fn(),
      listen: expressListenJest,
    }));
    (expressMock as any).json = jest.fn();
    (expressMock as any).Request = {};
    (expressMock as any).Response = {};
    (expressMock as any).NextFunction = {};

    jest.doMock("../db/mongo", () => mongoMock);
    jest.doMock("../db/redis", () => redisMock);
    jest.doMock("../db/seed", () => seedMock);
    jest.doMock("../rag/knowledgeSync", () => knowledgeSyncMock);
    jest.doMock("../middleware/rateLimiter", () => rateLimiterMock);
    jest.doMock("../routes/auth", () => ({ authRouter: {} }));
    jest.doMock("../routes/health", () => ({ default: {} }));
    jest.doMock("../routes/orders", () => ({ orderProxy: {} }));
    jest.doMock("../routes/inventory", () => ({ inventoryProxy: {} }));
    jest.doMock("../routes/sagas", () => ({ sagaProxy: {} }));
    jest.doMock("express", () => expressMock);

    jest.isolateModules(() => {
      require("../index");
    });

    expect(mongoMock.connectMongo).not.toHaveBeenCalled();
    expect(expressListenJest).not.toHaveBeenCalled();

    jest.dontMock("../db/mongo");
    jest.dontMock("../db/redis");
    jest.dontMock("../db/seed");
    jest.dontMock("../rag/knowledgeSync");
    jest.dontMock("../middleware/rateLimiter");
    jest.dontMock("../routes/auth");
    jest.dontMock("../routes/health");
    jest.dontMock("../routes/inventory");
    jest.dontMock("../routes/orders");
    jest.dontMock("../routes/sagas");
    jest.dontMock("express");
  });

  it("no real infrastructure/network calls occur", async () => {
    await startServer();

    expect(mockConnectMongo).toHaveBeenCalledTimes(1);
    expect(mockSeedUsers).toHaveBeenCalledTimes(1);
    expect(mockSyncKnowledgeCorpus).toHaveBeenCalledTimes(1);
    expect(mockConnectRedis).toHaveBeenCalledTimes(1);
    expect(mockListen).toHaveBeenCalledTimes(1);

    expect(mockConnectMongo).toHaveBeenCalledWith();
    expect(mockListen).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Function),
    );
  });
});
