import { describe, expect, it } from 'vitest';
import { applyMutation, buildDefaultMutations, createTask13Model } from '$lib/domain';
import { runMutationsLocal, solveLocal } from '$lib/solver';

describe('what-if pack', () => {
	it('builds default mutations and labor +10% raises Z', () => {
		const model = createTask13Model();
		const base = solveLocal(model);
		expect(base.status).toBe('done');
		const muts = buildDefaultMutations(model);
		expect(muts.length).toBeGreaterThan(10);
		const plusLabor = applyMutation(model, {
			kind: 'resource_change',
			target: 'Труд',
			delta: 0.1
		});
		const sens = solveLocal(plusLabor);
		expect(sens.result!.Z).toBeCloseTo(160.666667, 2);
	});

	it('runMutationsLocal returns done for full pack', () => {
		const model = createTask13Model();
		const pack = runMutationsLocal(model, buildDefaultMutations(model));
		expect(pack.status).toBe('done');
		expect(pack.items.length).toBe(buildDefaultMutations(model).length);
	});
});
