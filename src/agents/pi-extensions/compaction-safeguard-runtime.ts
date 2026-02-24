import type { AgentCompactionMode } from "../../config/types.agent-defaults.js";
import { createSessionManagerRuntimeRegistry } from "./session-manager-runtime-registry.js";

export type CompactionSafeguardRuntimeValue = {
  maxHistoryShare?: number;
  contextWindowTokens?: number;
  /** Compaction mode: "default" | "safeguard" | "drop-only" */
  compactionMode?: AgentCompactionMode;
  /** Workspace directory for archiving dropped messages. Falls back to process.cwd() if not set. */
  workspaceDir?: string;
  /** Session key for tagging archived messages. */
  sessionKey?: string;
};

const registry = createSessionManagerRuntimeRegistry<CompactionSafeguardRuntimeValue>();

export const setCompactionSafeguardRuntime = registry.set;

export const getCompactionSafeguardRuntime = registry.get;
