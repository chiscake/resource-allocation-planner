/**
 * Stop local Edge Functions runtime (leaves the rest of `supabase start` up).
 * Mirrors what Ctrl+C on `supabase functions serve` does to the edge-runtime container.
 */
import { execSync } from "node:child_process";

function idsFor(filter) {
  try {
    return execSync(`docker ps -q --filter "${filter}"`, { encoding: "utf8" })
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  } catch {
    return [];
  }
}

const ids = idsFor("name=supabase_edge_runtime");
if (ids.length === 0) {
  console.log("No local edge-runtime container running.");
  process.exit(0);
}

execSync(`docker stop ${ids.join(" ")}`, { stdio: "inherit" });
console.log("Stopped local Edge Functions runtime.");
