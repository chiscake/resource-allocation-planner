/** Shared types for Edge solver mirror (no $lib). */
export type SolveMethod = 'lp' | 'ipm' | 'ga';
export type SolveEngine = 'native' | 'library';
export type ResolvedVenue = 'cloud' | 'local';

export interface Model {
	schema_version: number;
	resources: string[];
	products: string[];
	A: number[][];
	b: number[];
	c: number[];
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

export type SimplexTraceFrame = {
	matrix?: number[][];
	reducedCosts?: number[];
	basis?: string[];
	note?: string;
	phase?: 1 | 2;
	Z?: number;
	colLabels?: string[];
	rowLabels?: string[];
	entering?: string;
	leaving?: string;
	problem?: 'primal' | 'dual';
};

export type SolveTrace =
	| { method: 'lp'; frames: SimplexTraceFrame[]; dual_frames?: SimplexTraceFrame[] }
	| { method: 'ga'; generations: unknown[] }
	| { method: 'ipm'; frames: unknown[] };

export function libraryPackageId(method: SolveMethod, engine: SolveEngine): string {
	if (method === 'lp') {
		return engine === 'library' ? 'javascript-lp-solver' : 'simplex-native';
	}
	if (method === 'ipm') {
		return engine === 'library' ? 'interior-point-lib' : 'interior-point';
	}
	return engine === 'library' ? 'ga-evolutionary-lib' : 'ga-evolutionary';
}

export function libraryFor(
	method: SolveMethod,
	venue: ResolvedVenue,
	engine: SolveEngine
): string {
	return `${libraryPackageId(method, engine)}@${venue}`;
}

export const SCHEMA_VERSION = 1;
export const LIMITS = {
	maxVariables: 200,
	maxConstraints: 200,
	maxDenseCells: 20_000,
	singleSolveMs: 5000,
	mutationMaxK: 64
};
