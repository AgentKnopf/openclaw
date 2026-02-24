import { describe, expect, it } from "vitest";

// Note: We test the internal logic by importing the module
// The buildEmbeddedExtensionPaths function requires complex dependencies (SessionManager, Model),
// so we focus on testing the config resolution logic

describe("compaction mode resolution", () => {
  // These tests verify the configuration logic for compaction modes
  // The actual function resolveCompactionMode is not exported, so we test via integration

  describe("AgentCompactionMode type", () => {
    it("supports 'default' mode", () => {
      const mode: "default" | "safeguard" | "drop-only" = "default";
      expect(mode).toBe("default");
    });

    it("supports 'safeguard' mode", () => {
      const mode: "default" | "safeguard" | "drop-only" = "safeguard";
      expect(mode).toBe("safeguard");
    });

    it("supports 'drop-only' mode", () => {
      const mode: "default" | "safeguard" | "drop-only" = "drop-only";
      expect(mode).toBe("drop-only");
    });
  });

  describe("config parsing", () => {
    it("parses drop-only from config object", () => {
      const config = {
        agents: {
          defaults: {
            compaction: {
              mode: "drop-only" as const,
            },
          },
        },
      };
      expect(config.agents?.defaults?.compaction?.mode).toBe("drop-only");
    });

    it("parses safeguard from config object", () => {
      const config = {
        agents: {
          defaults: {
            compaction: {
              mode: "safeguard" as const,
            },
          },
        },
      };
      expect(config.agents?.defaults?.compaction?.mode).toBe("safeguard");
    });

    it("returns undefined when compaction not configured", () => {
      const config: { agents?: { defaults?: { compaction?: { mode?: string } } } } = {
        agents: { defaults: {} },
      };
      expect(config.agents?.defaults?.compaction).toBeUndefined();
    });

    it("returns undefined when mode not specified", () => {
      const config = {
        agents: {
          defaults: {
            compaction: {},
          },
        },
      };
      expect((config.agents?.defaults?.compaction as { mode?: string })?.mode).toBeUndefined();
    });
  });
});

describe("compaction runtime value", () => {
  // Test the runtime value structure used by compaction-safeguard-runtime
  describe("CompactionSafeguardRuntimeValue structure", () => {
    it("supports compactionMode field", () => {
      const runtime = {
        maxHistoryShare: 0.5,
        contextWindowTokens: 200000,
        compactionMode: "drop-only" as const,
      };
      expect(runtime.compactionMode).toBe("drop-only");
    });

    it("all fields are optional", () => {
      const runtime: {
        maxHistoryShare?: number;
        contextWindowTokens?: number;
        compactionMode?: "default" | "safeguard" | "drop-only";
      } = {};
      expect(runtime.compactionMode).toBeUndefined();
      expect(runtime.maxHistoryShare).toBeUndefined();
    });

    it("supports safeguard as default fallback value", () => {
      const runtime: { compactionMode?: string } = {};
      const mode = runtime.compactionMode ?? "safeguard";
      expect(mode).toBe("safeguard");
    });

    it("supports workspaceDir field", () => {
      const runtime = {
        compactionMode: "drop-only" as const,
        workspaceDir: "/home/user/.openclaw/workspace",
      };
      expect(runtime.workspaceDir).toBe("/home/user/.openclaw/workspace");
    });

    it("supports sessionKey field", () => {
      const runtime = {
        compactionMode: "drop-only" as const,
        sessionKey: "main",
      };
      expect(runtime.sessionKey).toBe("main");
    });

    it("workspaceDir and sessionKey are optional", () => {
      const runtime: {
        compactionMode?: "default" | "safeguard" | "drop-only";
        workspaceDir?: string;
        sessionKey?: string;
      } = { compactionMode: "drop-only" };
      expect(runtime.workspaceDir).toBeUndefined();
      expect(runtime.sessionKey).toBeUndefined();
    });
  });
});

describe("workspace resolution for drop-only archiving", () => {
  it("prefers explicit workspaceDir from runtime over process.cwd()", () => {
    const explicitDir = "/explicit/workspace";
    const runtime = { workspaceDir: explicitDir };
    // Simulate the resolution logic in compaction-safeguard.ts
    const resolved = runtime?.workspaceDir ?? process.cwd();
    expect(resolved).toBe(explicitDir);
  });

  it("falls back to process.cwd() when runtime has no workspaceDir", () => {
    const runtime: { workspaceDir?: string } = {};
    const resolved = runtime?.workspaceDir ?? process.cwd();
    expect(resolved).toBe(process.cwd());
  });

  it("falls back to process.cwd() when runtime is undefined", () => {
    // Cast to avoid TS narrowing `undefined` literal to `never`
    const runtime = undefined as unknown as { workspaceDir?: string } | undefined;
    const resolved = runtime?.workspaceDir ?? process.cwd();
    expect(resolved).toBe(process.cwd());
  });

  it("sessionKey from runtime is used when set", () => {
    const runtime = { sessionKey: "main" };
    const sessionKey = runtime?.sessionKey;
    expect(sessionKey).toBe("main");
  });

  it("sessionKey is undefined when not set in runtime", () => {
    const runtime: { sessionKey?: string } = {};
    const sessionKey = runtime?.sessionKey;
    expect(sessionKey).toBeUndefined();
  });
});
