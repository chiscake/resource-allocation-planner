#!/usr/bin/env node
/**
 * Cursor beforeMCPExecution: ask before cloud-mutating Supabase tools.
 */
import { createInterface } from "node:readline";

async function readStdin() {
  const chunks = [];
  for await (const line of createInterface({ input: process.stdin })) {
    chunks.push(line);
  }
  return chunks.join("\n");
}

function out(obj) {
  process.stdout.write(JSON.stringify(obj));
}

const raw = await readStdin();
let payload = {};
try {
  payload = JSON.parse(raw || "{}");
} catch {
  out({ permission: "allow" });
  process.exit(0);
}

const tool = String(payload.toolName ?? payload.tool ?? payload.name ?? "");
const server = String(payload.server ?? payload.namespace ?? "");
const blob = `${server} ${tool}`.toLowerCase();

const askTools = [
  "apply_migration",
  "deploy_edge_function",
  "merge_branch",
  "reset_branch",
  "delete_branch",
  "create_branch",
];

if (askTools.some((t) => blob.includes(t))) {
  out({
    permission: "ask",
    user_message: `MCP ${tool || "cloud mutate"} needs confirmation (see docs/COMMIT_WORKFLOW.md).`,
    agent_message: `Confirm before running Supabase MCP tool: ${tool || blob}`,
  });
  process.exit(0);
}

out({ permission: "allow" });
