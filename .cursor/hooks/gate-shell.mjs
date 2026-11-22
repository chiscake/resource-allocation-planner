#!/usr/bin/env node
/**
 * Cursor beforeShellExecution: gate dangerous git / supabase / vercel commands.
 * stdin: hook JSON; stdout: { permission: allow|ask|deny, ... }
 */
import { createInterface } from 'node:readline';

async function readStdin() {
  const chunks = [];
  for await (const line of createInterface({ input: process.stdin })) {
    chunks.push(line);
  }
  return chunks.join('\n');
}

function out(obj) {
  process.stdout.write(JSON.stringify(obj));
}

const raw = await readStdin();
let payload = {};
try {
  payload = JSON.parse(raw || '{}');
} catch {
  out({ permission: 'allow' });
  process.exit(0);
}

const command = String(payload.command ?? '');

const denyPatterns = [
  {
    re: /git\s+(commit|add).*(\.env\.local|\.env\.cloud|\.env\b)/i,
    msg: 'Do not stage or commit env secret files.',
  },
  {
    re: /git\s+(commit|add).*\.vercel(\b|\/|\\)/i,
    msg: 'Do not commit .vercel/.',
  },
];

for (const { re, msg } of denyPatterns) {
  if (re.test(command)) {
    out({
      permission: 'deny',
      user_message: msg,
      agent_message: msg,
    });
    process.exit(0);
  }
}

const askPatterns = [
  {
    re: /git\s+push\s+.*\bmain\b/i,
    msg: 'Push to main requires release checklist (docs/COMMIT_WORKFLOW.md). Confirm with the user.',
  },
  {
    re: /git\s+push\s+[^\n]*--force(-with-lease)?/i,
    msg: 'Force-push requested. Confirm with the user.',
  },
  {
    re: /supabase\s+db\s+push/i,
    msg: 'Cloud migration push. Confirm the user wants to ship schema.',
  },
  {
    re: /supabase\s+functions\s+deploy/i,
    msg: 'Edge Function deploy to cloud. Confirm with the user.',
  },
  {
    re: /vercel\s+([^\n]*\s)?--prod\b|vercel\s+deploy\s+[^\n]*--prod/i,
    msg: 'Manual production Vercel deploy. Prefer Git push unless debugging.',
  },
];

for (const { re, msg } of askPatterns) {
  if (re.test(command)) {
    out({
      permission: 'ask',
      user_message: msg,
      agent_message: msg,
    });
    process.exit(0);
  }
}

out({ permission: 'allow' });
