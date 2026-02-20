import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { archiveMessagesToMemory, createDropPlaceholder } from "./archive-messages.js";
import type { AgentMessage } from "@mariozechner/pi-agent-core";

describe("createDropPlaceholder", () => {
  it("includes message count", () => {
    const result = createDropPlaceholder({
      messageCount: 42,
      timestamp: Date.now(),
    });
    expect(result).toContain("42 messages");
  });

  it("includes archive path when provided", () => {
    const result = createDropPlaceholder({
      messageCount: 10,
      archivePath: "/workspace/memory/2026-02-18.md",
      timestamp: Date.now(),
    });
    expect(result).toContain("/workspace/memory/2026-02-18.md");
  });

  it("mentions memory_search for retrieval", () => {
    const result = createDropPlaceholder({
      messageCount: 5,
      timestamp: Date.now(),
    });
    expect(result).toContain("memory_search");
  });

  it("includes formatted date and time", () => {
    const timestamp = new Date("2026-02-18T14:30:00Z").getTime();
    const result = createDropPlaceholder({
      messageCount: 5,
      timestamp,
    });
    // Should contain some date format
    expect(result).toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe("archiveMessagesToMemory", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-archive-test-"));
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("creates memory directory if it does not exist", async () => {
    const messages: AgentMessage[] = [
      {
        role: "user",
        content: [{ type: "text", text: "Hello, world!" }],
      },
    ];

    await archiveMessagesToMemory({
      messages,
      workspaceDir: tmpDir,
      timestamp: Date.now(),
    });

    const memoryDir = path.join(tmpDir, "memory");
    const stat = await fs.stat(memoryDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it("creates a date-stamped markdown file", async () => {
    const messages: AgentMessage[] = [
      {
        role: "user",
        content: [{ type: "text", text: "Test message" }],
      },
    ];

    const timestamp = new Date("2026-02-18T14:30:00Z").getTime();
    const result = await archiveMessagesToMemory({
      messages,
      workspaceDir: tmpDir,
      timestamp,
    });

    expect(result.archivePath).toContain("2026-02-18.md");
    const content = await fs.readFile(result.archivePath, "utf-8");
    expect(content).toContain("Test message");
  });

  it("returns correct message count", async () => {
    const messages: AgentMessage[] = [
      { role: "user", content: [{ type: "text", text: "Message 1" }] },
      { role: "assistant", content: [{ type: "text", text: "Response 1" }] },
      { role: "user", content: [{ type: "text", text: "Message 2" }] },
    ];

    const result = await archiveMessagesToMemory({
      messages,
      workspaceDir: tmpDir,
      timestamp: Date.now(),
    });

    expect(result.messageCount).toBe(3);
  });

  it("appends to existing file", async () => {
    const timestamp = new Date("2026-02-18T14:30:00Z").getTime();
    
    // First archive
    await archiveMessagesToMemory({
      messages: [{ role: "user", content: [{ type: "text", text: "First batch" }] }],
      workspaceDir: tmpDir,
      timestamp,
    });

    // Second archive (same date)
    await archiveMessagesToMemory({
      messages: [{ role: "user", content: [{ type: "text", text: "Second batch" }] }],
      workspaceDir: tmpDir,
      timestamp: timestamp + 1000, // 1 second later, same day
    });

    const archivePath = path.join(tmpDir, "memory", "2026-02-18.md");
    const content = await fs.readFile(archivePath, "utf-8");
    
    expect(content).toContain("First batch");
    expect(content).toContain("Second batch");
  });

  it("includes session key when provided", async () => {
    const messages: AgentMessage[] = [
      { role: "user", content: [{ type: "text", text: "Hello" }] },
    ];

    const result = await archiveMessagesToMemory({
      messages,
      workspaceDir: tmpDir,
      sessionKey: "test:session:123",
      timestamp: Date.now(),
    });

    const content = await fs.readFile(result.archivePath, "utf-8");
    expect(content).toContain("test:session:123");
  });

  it("formats user messages correctly", async () => {
    const messages: AgentMessage[] = [
      { role: "user", content: [{ type: "text", text: "User said this" }] },
    ];

    const result = await archiveMessagesToMemory({
      messages,
      workspaceDir: tmpDir,
      timestamp: Date.now(),
    });

    const content = await fs.readFile(result.archivePath, "utf-8");
    expect(content).toContain("User");
    expect(content).toContain("User said this");
  });

  it("formats assistant messages correctly", async () => {
    const messages: AgentMessage[] = [
      { role: "assistant", content: [{ type: "text", text: "Assistant response" }] },
    ];

    const result = await archiveMessagesToMemory({
      messages,
      workspaceDir: tmpDir,
      timestamp: Date.now(),
    });

    const content = await fs.readFile(result.archivePath, "utf-8");
    expect(content).toContain("Assistant");
    expect(content).toContain("Assistant response");
  });

  it("truncates long tool results", async () => {
    const longText = "x".repeat(1000);
    const messages: AgentMessage[] = [
      {
        role: "toolResult",
        toolCallId: "call_123",
        toolName: "read_file",
        content: [{ type: "text", text: longText }],
      } as unknown as AgentMessage,
    ];

    const result = await archiveMessagesToMemory({
      messages,
      workspaceDir: tmpDir,
      timestamp: Date.now(),
    });

    const content = await fs.readFile(result.archivePath, "utf-8");
    // Should be truncated to ~500 chars
    expect(content.length).toBeLessThan(longText.length);
    expect(content).toContain("truncated");
  });
});