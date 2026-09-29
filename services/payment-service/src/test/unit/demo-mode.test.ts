describe("DEMO_MODE config parsing", () => {
  const original = process.env.DEMO_MODE;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.DEMO_MODE;
    } else {
      process.env.DEMO_MODE = original;
    }
    jest.resetModules();
  });

  async function loadDemoMode(): Promise<boolean> {
    return new Promise((resolve) => {
      jest.isolateModules(() => {
        const config = require("../../config");
        resolve(config.DEMO_MODE);
      });
    });
  }

  it("is true when DEMO_MODE=true", async () => {
    process.env.DEMO_MODE = "true";
    expect(await loadDemoMode()).toBe(true);
  });

  it("is false when DEMO_MODE=false", async () => {
    process.env.DEMO_MODE = "false";
    expect(await loadDemoMode()).toBe(false);
  });

  it("is false when DEMO_MODE is unset", async () => {
    delete process.env.DEMO_MODE;
    expect(await loadDemoMode()).toBe(false);
  });

  it("is true when DEMO_MODE=TRUE (case-insensitive)", async () => {
    process.env.DEMO_MODE = "TRUE";
    expect(await loadDemoMode()).toBe(true);
  });
});
