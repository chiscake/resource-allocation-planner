/** Current model document version — do not bump while AGENTS schema_version rule exists. */
export const SCHEMA_VERSION = 1 as const;

export type SolveStatus = "done" | "rejected_too_large" | "accepted";

export type VenuePreference = "auto" | "cloud" | "local";
export type ResolvedVenue = "cloud" | "local";

export interface Model {
  schema_version: typeof SCHEMA_VERSION;
  resources: string[];
  products: string[];
  /** rows = resources, cols = products */
  A: number[][];
  b: number[];
  c: number[];
  resource_units?: string[];
  product_units?: string[];
  what_if_defaults?: WhatIfDefaults;
}

export interface WhatIfDefaults {
  resource_pct?: number;
  modernization_pct?: number;
  price_pct?: number;
}

export type MutationKind = "resource_change" | "modernization" | "price_change";

export interface Mutation {
  kind: MutationKind;
  /** Resource or product name */
  target: string;
  /** Relative change, e.g. 0.1 = +10%, -0.1 = -10% */
  delta: number;
  label?: string;
}

export interface SolveResult {
  x: Record<string, number>;
  Z: number;
  resource_usage: Record<string, number>;
  resource_slack: Record<string, number>;
  shadow_prices: Record<string, number>;
  critical_resources: string[];
  non_critical_resources: string[];
  feasible: boolean;
}

export interface SolverMeta {
  venue: ResolvedVenue;
  library: string;
  duration_ms: number;
  rejected_reason?: string;
  hint?: string;
  /** Present when plan x was post-rounded for display; duals remain from continuous LP. */
  rounding?: "nearest";
}

export interface SolveRequest {
  model: Model;
}

export interface SolveResponse {
  status: SolveStatus;
  result?: SolveResult;
  solver_meta: SolverMeta;
}

export interface MutationRunItem {
  mutation: Mutation;
  model: Model;
  response: SolveResponse;
}

export interface RunMutationsResponse {
  status: SolveStatus;
  items: MutationRunItem[];
  solver_meta: SolverMeta;
}
