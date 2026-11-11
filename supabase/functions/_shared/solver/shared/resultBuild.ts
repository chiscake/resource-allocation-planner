import type { Model, SolveResult } from '../types.ts';

const DUAL_EPS = 1e-6;
const CRITICAL_EPS = 1e-4;

export function buildSolveResult(
	model: Model,
	xVec: number[],
	yVec: number[],
	feasible: boolean
): SolveResult {
	const x: Record<string, number> = {};
	let Z = 0;
	for (let j = 0; j < model.products.length; j++) {
		const val = Math.max(0, xVec[j] ?? 0);
		x[model.products[j]] = val;
		Z += model.c[j] * val;
	}

	const resource_usage: Record<string, number> = {};
	const resource_slack: Record<string, number> = {};
	const shadow_prices: Record<string, number> = {};
	const critical_resources: string[] = [];
	const non_critical_resources: string[] = [];

	for (let i = 0; i < model.resources.length; i++) {
		let usage = 0;
		for (let j = 0; j < model.products.length; j++) {
			usage += model.A[i][j] * (x[model.products[j]] ?? 0);
		}
		const name = model.resources[i];
		resource_usage[name] = usage;
		resource_slack[name] = model.b[i] - usage;
		const sp = Math.max(0, yVec[i] ?? 0);
		shadow_prices[name] = sp < DUAL_EPS ? 0 : sp;
		if (shadow_prices[name] > CRITICAL_EPS) critical_resources.push(name);
		else non_critical_resources.push(name);
	}

	return {
		x,
		Z,
		resource_usage,
		resource_slack,
		shadow_prices,
		critical_resources,
		non_critical_resources,
		feasible
	};
}

export function variableBounds(model: Model): number[] {
	const n = model.products.length;
	const bounds = new Array(n).fill(0);
	for (let j = 0; j < n; j++) {
		let ub = Number.POSITIVE_INFINITY;
		for (let i = 0; i < model.resources.length; i++) {
			const a = model.A[i][j];
			if (a > 1e-12) ub = Math.min(ub, model.b[i] / a);
		}
		bounds[j] = Number.isFinite(ub) && ub > 0 ? ub : Math.max(...model.b, 1) * 10;
	}
	return bounds;
}

export function usageViolation(model: Model, xVec: number[]): number {
	let penalty = 0;
	for (let i = 0; i < model.resources.length; i++) {
		let usage = 0;
		for (let j = 0; j < model.products.length; j++) {
			usage += model.A[i][j] * Math.max(0, xVec[j] ?? 0);
		}
		penalty += Math.max(0, usage - model.b[i]);
	}
	for (let j = 0; j < model.products.length; j++) {
		penalty += Math.max(0, -(xVec[j] ?? 0));
	}
	return penalty;
}
