// DEMO_MODE enables demo-only behaviors. It must be the exact string
// "true" (case-insensitive) to enable; any other value (including unset)
// disables demo behaviors per AGENTS.md.
export const DEMO_MODE: boolean =
  (process.env.DEMO_MODE ?? "").toLowerCase() === "true";
