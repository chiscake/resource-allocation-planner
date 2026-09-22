import type { CellInputValidator } from './types';

/**
 * Built-in draft validators for editable matrix cells.
 *
 * Mid-edit rules allow an empty string so the user can clear and retype.
 * On commit, `Matrix` additionally rejects empty drafts and reverts to the
 * last committed cell value.
 */
export const validators = {
	/**
	 * Non-negative integers while typing: `''` or digits only (`/^\d*$/`).
	 */
	nonNegativeInteger: ((raw) => /^\d*$/.test(raw)) satisfies CellInputValidator,

	/**
	 * Signed integers while typing: `''`, optional leading `-`, then digits
	 * (`/^-?\d*$/`). Does not allow a lone `-` past commit (empty/`-` revert).
	 */
	integer: ((raw) => /^-?\d*$/.test(raw)) satisfies CellInputValidator,

	/**
	 * Signed decimals while typing: empty, `-`, partial `.`, or a finite number draft.
	 * Suitable for LP coefficients (A, b, c).
	 */
	decimal: ((raw) => {
		if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return true;
		return /^-?\d*\.?\d*$/.test(raw) && Number.isFinite(Number(raw));
	}) satisfies CellInputValidator
} as const;
