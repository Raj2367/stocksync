jest.mock("mongoose", () => ({
  __esModule: true,
  default: {
    connect: jest.fn().mockResolvedValue(true),
    disconnect: jest.fn().mockResolvedValue(true),
    connection: { readyState: 0 },
  },
}));

import mongoose from "mongoose";
import { connectMongo, disconnectMongo } from "../../db/mongo";

const DEFAULT_MONGO_URI = "mongodb://localhost:27017/sagas";

describe("Saga Orchestrator Mongo connection helper", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("connectMongo connects mongoose to MONGO_URI (separate Saga database)", async () => {
    await connectMongo();

    const expectedUri = process.env.MONGO_URI || DEFAULT_MONGO_URI;
    expect(mongoose.connect).toHaveBeenCalledTimes(1);
    expect(mongoose.connect).toHaveBeenCalledWith(expectedUri);
  });

  it("disconnectMongo disconnects mongoose", async () => {
    await disconnectMongo();

    expect(mongoose.disconnect).toHaveBeenCalledTimes(1);
  });
});
