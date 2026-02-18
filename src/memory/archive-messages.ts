/**
 * Archive dropped messages to memory files for RAG indexing.
 * This module provides functions to persist conversation history
 * when using "drop-only" compaction mode.
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import fs from "node:fs/promises";
import path from "node:path";

const ARCHIVE_MARKER = "[ARCHIVED_CONVERSATION]";

type TextContent = { type: "text"; text: string };
type ThinkingContent = { type: "thinking"; thinking: string };
type ToolCallContent = { type: "toolCall"; toolName: string; arguments?: unknown };

/**
 * Format a date as YYYY-MM-DD in the specified timezone.
 */
function formatDateStamp(nowMs: number, timezone?: string): string {
  const tz = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(nowMs));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (year && month && day) {
    return `${year}-${month}-${day}`;
  }
  return new Date(nowMs).toISOString().slice(0, 10);
}

/**
 * Format a timestamp as HH:MM:SS in the specified timezone.
 */
function formatTimeStamp(nowMs: number, timezone?: string): string {
  const tz = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(nowMs));
}

/**
 * Extract text content from a message.
 */
function extractMessageText(message: AgentMessage): string {
  if (message.role === "user") {
    const content = message.content;
    if (typeof content === "string") {
      return content;
    }
    const parts: string[] = [];
    for (const block of content) {
      if (block.type === "text") {
        parts.push((block as TextContent).text);
      }
    }
    return parts.join("\n");
  }

  if (message.role === "assistant") {
    const parts: string[] = [];
    for (const block of message.content) {
      if (block.type === "text") {
        parts.push((block as TextContent).text);
      } else if (block.type === "thinking") {
        // Include thinking in archives for completeness
        parts.push(`[thinking: ${(block as ThinkingContent).thinking.slice(0, 200)}...]`);
      } else if (block.type === "toolCall") {
        const tc = block as ToolCallContent;
        parts.push(`[tool: ${tc.toolName}]`);
      }
    }
    return parts.join("\n");
  }

  if (message.role === "toolResult") {
    const parts: string[] = [];
    for (const block of message.content) {
      if (block.type === "text") {
        // Truncate long tool results
        const text = (block as TextContent).text;
        if (text.length > 500) {
          parts.push(`${text.slice(0, 500)}... [truncated ${text.length - 500} chars]`);
        } else {
          parts.push(text);
        }
      }
    }
    const toolName = (message as unknown as { toolName?: string }).toolName ?? "tool";
    return `[${toolName} result]: ${parts.join("\n")}`;
  }

  return "";
}

/**
 * Format messages as markdown for archiving.
 */
function formatMessagesAsMarkdown(
  messages: AgentMessage[],
  sessionKey?: string,
  timestamp?: number,
): string {
  const nowMs = timestamp ?? Date.now();
  const dateStamp = formatDateStamp(nowMs);
  const timeStamp = formatTimeStamp(nowMs);

  const lines: string[] = [
    "",
    `## ${ARCHIVE_MARKER}`,
    `**Archived at:** ${dateStamp} ${timeStamp}`,
    sessionKey ? `**Session:** ${sessionKey}` : "",
    `**Messages:** ${messages.length}`,
    "",
    "---",
    "",
  ];

  for (const message of messages) {
    const role = message.role === "user" ? "👤 User" : message.role === "assistant" ? "🤖 Assistant" : "🔧 Tool";
    const text = extractMessageText(message);
    if (text.trim()) {
      lines.push(`### ${role}`);
      lines.push("");
      lines.push(text);
      lines.push("");
    }
  }

  lines.push("---");
  lines.push("");

  return lines.join("\n");
}

/**
 * Archive messages to a memory file.
 * Appends to existing file or creates new one.
 */
export async function archiveMessagesToMemory(params: {
  messages: AgentMessage[];
  workspaceDir: string;
  sessionKey?: string;
  timestamp?: number;
  timezone?: string;
}): Promise<{ archivePath: string; messageCount: number }> {
  const nowMs = params.timestamp ?? Date.now();
  const dateStamp = formatDateStamp(nowMs, params.timezone);
  
  // Ensure memory directory exists
  const memoryDir = path.join(params.workspaceDir, "memory");
  await fs.mkdir(memoryDir, { recursive: true });
  
  // Archive file path
  const archivePath = path.join(memoryDir, `${dateStamp}.md`);
  
  // Format messages
  const content = formatMessagesAsMarkdown(params.messages, params.sessionKey, nowMs);
  
  // Append to file
  await fs.appendFile(archivePath, content, "utf-8");
  
  return {
    archivePath,
    messageCount: params.messages.length,
  };
}

/**
 * Create a placeholder summary for dropped messages.
 * This is inserted into the context instead of the full messages.
 */
export function createDropPlaceholder(params: {
  messageCount: number;
  archivePath?: string;
  timestamp?: number;
}): string {
  const nowMs = params.timestamp ?? Date.now();
  const dateStamp = formatDateStamp(nowMs);
  const timeStamp = formatTimeStamp(nowMs);
  
  const lines = [
    `[Earlier conversation archived at ${dateStamp} ${timeStamp}]`,
    `${params.messageCount} messages moved to memory for RAG retrieval.`,
  ];
  
  if (params.archivePath) {
    lines.push(`Archive: ${params.archivePath}`);
  }
  
  lines.push("Use memory_search to retrieve past context if needed.");
  
  return lines.join("\n");
}