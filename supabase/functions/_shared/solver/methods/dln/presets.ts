import type { DlnRunConfig } from '../../types.ts';
import type { DlnHyperparameters } from './native.ts';

export type DlnPresetId = 'fast' | 'precise' | 'custom';

export const DLN_PRESET_DEFS: Record<
	Exclude<DlnPresetId, 'custom'>,
	DlnHyperparameters & { labelKey: string }
> = {
	fast: {
		labelKey: 'dlnPresetFast',
		lambda: 0.003,
		kappa: 30,
		tol: 1e-6,
		rowScale: true,
		maxIter: 20_000
	},
	precise: {
		labelKey: 'dlnPresetPrecise',
		lambda: 0.005,
		kappa: 3,
		tol: 1e-8,
		rowScale: true,
		maxIter: 100_000
	}
};

export function dlnHyperToRunConfig(
	hyper: DlnHyperparameters,
	preset: DlnPresetId = 'custom'
): DlnRunConfig {
	return {
		lambda: hyper.lambda,
		kappa: hyper.kappa,
		tol: hyper.tol,
		rowScale: hyper.rowScale,
		maxIter: hyper.maxIter,
		preset
	};
}

export function dlnRunConfigToHyper(
	config: Partial<DlnRunConfig> | undefined
): Partial<DlnHyperparameters> {
	if (!config) return {};
	const { lambda, kappa, tol, rowScale, maxIter } = config;
	return {
		...(lambda != null ? { lambda } : {}),
		...(kappa != null ? { kappa } : {}),
		...(tol != null ? { tol } : {}),
		...(rowScale != null ? { rowScale } : {}),
		...(maxIter != null ? { maxIter } : {})
	};
}

export function resolveDlnHyper(
	preset: DlnPresetId | undefined,
	overrides: Partial<DlnHyperparameters> = {},
	baseDefaults: DlnHyperparameters
): DlnHyperparameters {
	const fromPreset =
		preset && preset !== 'custom' ? DLN_PRESET_DEFS[preset] : DLN_PRESET_DEFS.precise;
	const { labelKey: _l, ...presetParams } = fromPreset as typeof fromPreset & {
		labelKey?: string;
	};
	return { ...baseDefaults, ...presetParams, ...overrides };
}

export function resolveDlnFromRunConfig(
	config: Partial<DlnRunConfig> | undefined,
	baseDefaults: DlnHyperparameters
): { hyper: DlnHyperparameters; preset: DlnPresetId } {
	const preset = (config?.preset ?? 'precise') as DlnPresetId;
	const hyper = resolveDlnHyper(preset, dlnRunConfigToHyper(config), baseDefaults);
	return { hyper, preset };
}
