#!/usr/bin/env node
/**
 * Pre-commit / pre-push gate for resource-allocation-planner.
 * Usage:
 *   node scripts/preflight.mjs           # secrets + format:check + check + test
 *   node scripts/preflight.mjs --quick   # secrets only
 *   node scripts/preflight.mjs --main    # full + migration name lint + main reminders
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const quick = args.has('--quick');
const mainMode = args.has('--main');

const SECRET_BASENAMES = new Set([
  '.env',
  '.env.local',
  '.env.cloud',
  '.env.development.local',
  '.env.test.local',
  '.env.production.local',
]);

function fail(msg) {
  console.error(`preflight: ${msg}`);
  process.exit(1);
}

function run(cmd, cmdArgs, label) {
  console.log(`preflight: ${label}`);
  const r = spawnSync(cmd, cmdArgs, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  });
  if (r.status !== 0) fail(`${label} failed (exit ${r.status ?? 'unknown'})`);
}

function stagedFiles() {
  const r = spawnSync('git', ['diff', '--cached', '--name-only', '-z'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (r.status !== 0) return [];
  return (r.stdout || '').split('\0').filter(Boolean);
}

function branchName() {
  const r = spawnSync('git', ['branch', '--show-current'], {
    cwd: root,
    encoding: 'utf8',
  });
  return (r.stdout || '').trim();
}

function scanSecrets() {
  const staged = stagedFiles();
  const bad = staged.filter((f) => {
    const base = f.split(/[/\\]/).pop() ?? f;
    if (SECRET_BASENAMES.has(base)) return true;
    if (f === '.vercel' || f.startsWith('.vercel/') || f.startsWith('.vercel\\')) return true;
    if (f.includes('supabase/.temp/') || f.includes('supabase\\.temp\\')) return true;
    if (base.startsWith('.env.') && base !== '.env.example') return true;
    return false;
  });
  if (bad.length) {
    fail(`refusing secret/link paths in the index:\n  ${bad.join('\n  ')}`);
  }
  console.log('preflight: secret-path scan ok');
}

function lintMigrationNames() {
  const dir = join(root, 'supabase', 'migrations');
  if (!existsSync(dir)) return;
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql'));
  const bad = files.filter((f) => !/^\d{3}_[a-z0-9_]+\.sql$/i.test(f));
  if (bad.length) {
    fail(`migration filename(s) must be NNN_name.sql:\n  ${bad.join('\n  ')}`);
  }
  console.log(`preflight: migration names ok (${files.length} files)`);
}

scanSecrets();

if (mainMode) {
  lintMigrationNames();
  const b = branchName();
  console.log(`preflight: branch=${b || '(detached)'} (main mode)`);
  console.log(
    'preflight: before merge/push to main — confirm cloud migrations + Edge deploy parity (see docs/COMMIT_WORKFLOW.md).',
  );
}

if (quick) {
  console.log('preflight: quick mode done');
  process.exit(0);
}

run('pnpm', ['format:check'], 'pnpm format:check');
run('pnpm', ['check'], 'pnpm check');
run('pnpm', ['test'], 'pnpm test');
console.log('preflight: ok');
