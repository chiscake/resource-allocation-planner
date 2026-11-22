import {
  LIMITS,
  libraryFor,
  type Model,
  type SolveEngine,
  type SolveMethod,
} from '../_shared/solver/types.ts';
import { parseSolveRunOptions } from '../_shared/solver/parseOptions.ts';
import { defaultEngine, runSolve } from '../_shared/solver/run.ts';

const cors: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

type Mutation = { kind: string; target: string; delta: number; label?: string };

function isMethod(v: unknown): v is SolveMethod {
  return v === 'lp' || v === 'ipm' || v === 'ga' || v === 'dln';
}

function isEngine(v: unknown): v is SolveEngine {
  return v === 'native' || v === 'library';
}

function applyMutation(model: Model, mutation: Mutation): Model {
  const next = structuredClone(model);
  if (mutation.kind === 'resource_change') {
    const i = next.resources.indexOf(mutation.target);
    if (i >= 0) next.b[i] *= 1 + mutation.delta;
  } else if (mutation.kind === 'modernization') {
    const j = next.products.indexOf(mutation.target);
    if (j >= 0) for (let i = 0; i < next.resources.length; i++) next.A[i][j] *= 1 + mutation.delta;
  } else if (mutation.kind === 'price_change') {
    const j = next.products.indexOf(mutation.target);
    if (j >= 0) next.c[j] *= 1 + mutation.delta;
  }
  return next;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const body = (await req.json()) as {
      model?: Model;
      mutations?: Mutation[];
      method?: unknown;
      engine?: unknown;
      options?: unknown;
    };
    if (!body.model || !body.mutations) return json({ error: 'model and mutations required' }, 400);
    const method: SolveMethod = isMethod(body.method) ? body.method : 'lp';
    const engine = isEngine(body.engine) ? body.engine : defaultEngine(method);
    const options = parseSolveRunOptions(body.options);
    if (body.mutations.length > LIMITS.mutationMaxK) {
      return json({
        status: 'rejected_too_large',
        items: [],
        solver_meta: {
          venue: 'cloud',
          library: libraryFor(method, 'cloud', engine),
          method,
          engine,
          duration_ms: 0,
          rejected_reason: `K>${LIMITS.mutationMaxK}`,
        },
      });
    }
    const started = performance.now();
    const items = [];
    for (const mutation of body.mutations) {
      const model = applyMutation(body.model, mutation);
      const response = runSolve(model, method, engine, options);
      items.push({ mutation, model, response });
    }
    return json({
      status: 'done',
      items,
      solver_meta: {
        venue: 'cloud',
        library: libraryFor(method, 'cloud', engine),
        method,
        engine,
        duration_ms: performance.now() - started,
      },
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'error' }, 500);
  }
});
