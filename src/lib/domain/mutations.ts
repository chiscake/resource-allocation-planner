import type { Model, Mutation } from "./types";
import { SCHEMA_VERSION } from "./types";

/** Signed percent for labels, e.g. +10% / −15%. */
export function formatMutationDeltaPct(delta: number): string {
  const pct = Math.round(Math.abs(delta) * 100);
  const sign = delta >= 0 ? "+" : "−";
  return `${sign}${pct}%`;
}

/** End-user mutation title (RU). Kept here so DB titles match the sensitivity table. */
export function formatMutationLabel(mutation: Mutation): string {
  const d = formatMutationDeltaPct(mutation.delta);
  switch (mutation.kind) {
    case "resource_change":
      return `Запас: ${mutation.target} ${d}`;
    case "modernization":
      return `Расход: ${mutation.target} ${d}`;
    case "price_change":
      return `Цена: ${mutation.target} ${d}`;
    default:
      return mutation.label ?? mutation.kind;
  }
}

export function assertSchemaVersion(model: Model): void {
  if (model.schema_version !== SCHEMA_VERSION) {
    throw new Error(`Unsupported schema_version ${model.schema_version}`);
  }
}

/** Deep-clone a Model. Safe for Svelte `$state` proxies (`structuredClone` cannot clone them). */
export function cloneModel(model: Model): Model {
  try {
    return structuredClone(model);
  } catch {
    // Proxies / other non-cloneable hosts: Model is JSON-serializable.
    return JSON.parse(JSON.stringify(model)) as Model;
  }
}

/** Apply a single what-if mutation; returns a new model. */
export function applyMutation(model: Model, mutation: Mutation): Model {
  assertSchemaVersion(model);
  const next = cloneModel(model);

  switch (mutation.kind) {
    case "resource_change": {
      const i = next.resources.indexOf(mutation.target);
      if (i < 0) throw new Error(`Unknown resource: ${mutation.target}`);
      next.b[i] = next.b[i] * (1 + mutation.delta);
      break;
    }
    case "modernization": {
      const j = next.products.indexOf(mutation.target);
      if (j < 0) throw new Error(`Unknown product: ${mutation.target}`);
      for (let i = 0; i < next.resources.length; i++) {
        next.A[i][j] = next.A[i][j] * (1 + mutation.delta);
      }
      break;
    }
    case "price_change": {
      const j = next.products.indexOf(mutation.target);
      if (j < 0) throw new Error(`Unknown product: ${mutation.target}`);
      next.c[j] = next.c[j] * (1 + mutation.delta);
      break;
    }
    default:
      throw new Error(`Unknown mutation kind`);
  }

  return next;
}

/** True when a what-if pct should generate that mutation family. */
function activePct(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/** Task-13 style default mutation pack from what_if_defaults.
 * Missing/null/non-positive pct → that family is omitted (no 0.1 fallback). */
export function buildDefaultMutations(model: Model): Mutation[] {
  const d = model.what_if_defaults ?? {};
  const out: Mutation[] = [];
  const rp = d.resource_pct;
  const mp = d.modernization_pct;
  const pp = d.price_pct;

  if (activePct(rp)) {
    for (const r of model.resources) {
      const plus: Mutation = {
        kind: "resource_change",
        target: r,
        delta: rp,
      };
      const minus: Mutation = {
        kind: "resource_change",
        target: r,
        delta: -rp,
      };
      out.push({ ...plus, label: formatMutationLabel(plus) });
      out.push({ ...minus, label: formatMutationLabel(minus) });
    }
  }
  if (activePct(mp)) {
    for (const p of model.products) {
      const m: Mutation = {
        kind: "modernization",
        target: p,
        delta: -mp,
      };
      out.push({ ...m, label: formatMutationLabel(m) });
    }
  }
  if (activePct(pp)) {
    for (const p of model.products) {
      const plus: Mutation = {
        kind: "price_change",
        target: p,
        delta: pp,
      };
      const minus: Mutation = {
        kind: "price_change",
        target: p,
        delta: -pp,
      };
      out.push({ ...plus, label: formatMutationLabel(plus) });
      out.push({ ...minus, label: formatMutationLabel(minus) });
    }
  }
  return out;
}
