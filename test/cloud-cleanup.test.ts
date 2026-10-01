import { describe, expect, it } from "vitest";
import { conversationActivityTime, selectCloudCleanupCandidates } from "../src/m365-services";

describe("cloud conversation cleanup", () => {
  it("accepts numeric and ISO activity times but treats creation-only history as unknown", () => {
    expect(conversationActivityTime({ lastUpdatedTime: "1760000000000" })).toBe(1_760_000_000_000);
    expect(conversationActivityTime({ updatedAt: "2026-09-01T00:00:00Z" })).toBe(Date.parse("2026-09-01T00:00:00Z"));
    expect(conversationActivityTime({ createTimeUtc: 1_760_000_000_000 })).toBe(0);
  });

  it("preserves active bindings and unknown activity while selecting stale unbound chats", () => {
    const now = Date.parse("2026-10-01T00:00:00Z");
    const old = Date.parse("2026-09-01T00:00:00Z");
    const result = selectCloudCleanupCandidates([
      { conversationId: "recent", lastUpdatedTime: now - 60_000 },
      { conversationId: "active", lastUpdatedTime: old },
      { conversationId: "unknown", createTimeUtc: old },
      { conversationId: "stale", lastUpdatedTime: old },
    ], new Set(["active"]), 7, 0, now);
    expect(result.targets.map((item) => item.conversationId)).toEqual(["stale"]);
    expect(result.protected).toBe(1);
    expect(result.skippedUnknownActivity).toBe(1);
  });
});
