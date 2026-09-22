import { describe, expect, it } from 'vitest';
import {
	inputToPct,
	solveMethodToTab,
	tabToSolveMethod,
	whatIfRowsFromMutations
} from './solve-session.svelte';
import type { RunMutationsResponse } from '$lib/domain';

describe('solve-session helpers', () => {
	it('inputToPct maps percent text to fraction and blank to null', () => {
		expect(inputToPct('')).toBeNull();
		expect(inputToPct('  ')).toBeNull();
		expect(inputToPct('10')).toBeCloseTo(0.1);
		expect(inputToPct('0')).toBe(0);
		expect(inputToPct('nope')).toBeNull();
	});

	it('tabToSolveMethod / solveMethodToTab round-trip', () => {
		expect(tabToSolveMethod('plan')).toBe('lp');
		expect(tabToSolveMethod('ipm')).toBe('ipm');
		expect(tabToSolveMethod('ga')).toBe('ga');
		expect(tabToSolveMethod('4d')).toBe('lp');
		expect(solveMethodToTab('lp')).toBe('plan');
		expect(solveMethodToTab('ipm')).toBe('ipm');
		expect(solveMethodToTab('ga')).toBe('ga');
	});

	it('whatIfRowsFromMutations maps labels and Z', () => {
		const pack = {
			status: 'done',
			solver_meta: { venue: 'local', library: 'x', duration_ms: 1 },
			items: [
				{
					mutation: { kind: 'resource_change', target: 'A', delta: 0.1, label: 'A +10%' },
					model: {} as never,
					response: {
						status: 'done',
						result: { Z: 12.5 } as never,
						solver_meta: { venue: 'local', library: 'x', duration_ms: 1 }
					}
				},
				{
					mutation: { kind: 'price_change', target: 'P', delta: -0.1 },
					model: {} as never,
					response: {
						status: 'done',
						solver_meta: { venue: 'local', library: 'x', duration_ms: 1 }
					}
				}
			]
		} as RunMutationsResponse;

		const rows = whatIfRowsFromMutations(pack);
		expect(rows[0]).toEqual({ title: 'A +10%', Z: 12.5 });
		expect(rows[1].title).toBe('price_change');
		expect(rows[1].Z).toBeNaN();
	});
});
