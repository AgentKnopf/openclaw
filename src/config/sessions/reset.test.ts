import { describe, expect, it } from "vitest";
import {
  evaluateSessionFreshness,
  resolveSessionResetPolicy,
  type SessionResetPolicy,
} from "./reset.js";

describe("evaluateSessionFreshness", () => {
  describe("never mode", () => {
    it("returns fresh=true regardless of how old the session is", () => {
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const result = evaluateSessionFreshness({
        updatedAt: oneDayAgo,
        now: Date.now(),
        policy: { mode: "never", atHour: 4 },
      });
      expect(result.fresh).toBe(true);
    });

    it("returns fresh=true even for sessions weeks old", () => {
      const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
      const result = evaluateSessionFreshness({
        updatedAt: twoWeeksAgo,
        now: Date.now(),
        policy: { mode: "never", atHour: 4 },
      });
      expect(result.fresh).toBe(true);
    });

    it("returns undefined for dailyResetAt in never mode", () => {
      const result = evaluateSessionFreshness({
        updatedAt: Date.now() - 100000,
        now: Date.now(),
        policy: { mode: "never", atHour: 4 },
      });
      expect(result.dailyResetAt).toBeUndefined();
    });

    it("returns undefined for idleExpiresAt in never mode", () => {
      const result = evaluateSessionFreshness({
        updatedAt: Date.now() - 100000,
        now: Date.now(),
        policy: { mode: "never", atHour: 4, idleMinutes: 30 },
      });
      expect(result.idleExpiresAt).toBeUndefined();
    });

    it("ignores idleMinutes when mode is never", () => {
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      const result = evaluateSessionFreshness({
        updatedAt: oneHourAgo,
        now: Date.now(),
        policy: { mode: "never", atHour: 4, idleMinutes: 30 }, // Would be stale in idle mode
      });
      expect(result.fresh).toBe(true);
    });
  });

  describe("daily mode", () => {
    it("returns fresh=true for recent sessions", () => {
      const now = Date.now();
      const result = evaluateSessionFreshness({
        updatedAt: now - 1000, // 1 second ago
        now,
        policy: { mode: "daily", atHour: 4 },
      });
      expect(result.fresh).toBe(true);
    });

    it("returns fresh=false for sessions before daily reset", () => {
      // Create a timestamp for yesterday before the reset hour
      const now = new Date();
      now.setHours(12, 0, 0, 0); // Noon today
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(3, 0, 0, 0); // 3 AM yesterday (before 4 AM reset)

      const result = evaluateSessionFreshness({
        updatedAt: yesterday.getTime(),
        now: now.getTime(),
        policy: { mode: "daily", atHour: 4 },
      });
      expect(result.fresh).toBe(false);
    });
  });

  describe("idle mode", () => {
    it("returns fresh=true for recent activity", () => {
      const now = Date.now();
      const result = evaluateSessionFreshness({
        updatedAt: now - 10 * 60 * 1000, // 10 minutes ago
        now,
        policy: { mode: "idle", atHour: 4, idleMinutes: 30 },
      });
      expect(result.fresh).toBe(true);
    });

    it("returns fresh=false when idle timeout exceeded", () => {
      const now = Date.now();
      const result = evaluateSessionFreshness({
        updatedAt: now - 45 * 60 * 1000, // 45 minutes ago
        now,
        policy: { mode: "idle", atHour: 4, idleMinutes: 30 },
      });
      expect(result.fresh).toBe(false);
    });

    it("calculates correct idleExpiresAt timestamp", () => {
      const now = Date.now();
      const updatedAt = now - 10 * 60 * 1000;
      const idleMinutes = 30;
      const result = evaluateSessionFreshness({
        updatedAt,
        now,
        policy: { mode: "idle", atHour: 4, idleMinutes },
      });
      expect(result.idleExpiresAt).toBe(updatedAt + idleMinutes * 60 * 1000);
    });
  });
});

describe("resolveSessionResetPolicy", () => {
  it("returns never mode when configured", () => {
    const policy = resolveSessionResetPolicy({
      sessionCfg: {
        reset: { mode: "never" },
      },
      resetType: "direct",
    });
    expect(policy.mode).toBe("never");
  });

  it("returns daily mode by default", () => {
    const policy = resolveSessionResetPolicy({
      sessionCfg: {},
      resetType: "direct",
    });
    expect(policy.mode).toBe("daily");
  });

  it("supports resetOverride for never mode", () => {
    const policy = resolveSessionResetPolicy({
      sessionCfg: { reset: { mode: "daily" } },
      resetType: "direct",
      resetOverride: { mode: "never" },
    });
    expect(policy.mode).toBe("never");
  });

  it("respects resetByType for different session types", () => {
    const policy = resolveSessionResetPolicy({
      sessionCfg: {
        resetByType: {
          direct: { mode: "never" },
          group: { mode: "idle", idleMinutes: 60 },
        },
      },
      resetType: "direct",
    });
    expect(policy.mode).toBe("never");
  });
});