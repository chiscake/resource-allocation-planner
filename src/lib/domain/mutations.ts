import type { Model, Mutation } from "./types";
import { SCHEMA_VERSION } from "./types";

export function assertSchemaVersion(model: Model): void {
  if (model.schema_version !== SCHEMA_VERSION) {
    throw new Error(`Unsupported schema_version ${model.schema_version}`);
  }
}

export function cloneModel(model: Model): Model {
  return structuredClone(model);
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

/** Task-13 style default mutation pack from what_if_defaults. */
export function buildDefaultMutations(model: Model): Mutation[] {
  const d = model.what_if_defaults ?? {
    resource_pct: 0.1,
    modernization_pct: 0.1,
    price_pct: 0.15,
  };
  const out: Mutation[] = [];
  const rp = d.resource_pct ?? 0.1;
  const mp = d.modernization_pct ?? 0.1;
  const pp = d.price_pct ?? 0.15;

  for (const r of model.resources) {
    out.push({
      kind: "resource_change",
      target: r,
      delta: rp,
      label: `${r} +${rp * 100}%`,
    });
    out.push({
      kind: "resource_change",
      target: r,
      delta: -rp,
      label: `${r} -${rp * 100}%`,
    });
  }
  for (const p of model.products) {
    out.push({
      kind: "modernization",
      target: p,
      delta: -mp,
      label: `${p} A -${mp * 100}%`,
    });
  }
  for (const p of model.products) {
    out.push({
      kind: "price_change",
      target: p,
      delta: pp,
      label: `${p} c +${pp * 100}%`,
    });
    out.push({
      kind: "price_change",
      target: p,
      delta: -pp,
      label: `${p} c -${pp * 100}%`,
    });
  }
  return out;
}
