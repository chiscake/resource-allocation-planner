/**
 * Coordinates are 0-based and include the header row/column.
 * - (0, 0) — corner label
 * - (0, j) — column headers (j ≥ 1)
 * - (i, 0) — row headers (i ≥ 1)
 * - (i, j) — data cells (i ≥ 1, j ≥ 1)
 */
export type CellCoord = { row: number; col: number };

/**
 * Visual style for a cell, row, or column.
 *
 * ## Style precedence (resolved per property)
 * 1. **Cell** — highest; any property set on the cell wins
 * 2. **Row** — used when the cell does not set that property
 * 3. **Column** — used when neither cell nor row sets that property
 * 4. **Defaults** — `bold: false`; background from UI defaults:
 *    - header cells → brand-faint / bg
 *    - locked diagonal data cells → surface-strong
 *    - otherwise → none
 *
 * When both row and column set the same property and the cell does not,
 * the **row** wins for that property. Explicit cell/row/col backgrounds
 * override the diagonal gray default.
 */
export type CellStyle = {
  bold?: boolean;
  /** Any valid CSS color (e.g. `#fef3c7`, `oklch(...)`, `yellow`) */
  background?: string;
};

export type MatrixSnapshot = {
  cells: string[][];
  cellStyles: Array<{ row: number; col: number; style: CellStyle }>;
  rowStyles: Array<{ row: number; style: CellStyle }>;
  colStyles: Array<{ col: number; style: CellStyle }>;
};

export type MatrixFromSizeOptions = {
  /** Corner label at (0, 0). Default: empty string. */
  corner?: string;
  /** Value for the data diagonal (i, i) where i ≥ 1. */
  diagonal?: string;
  /**
   * When true (default), data diagonal cells are not UI-editable.
   * Programmatic `setValue` / loaders still work.
   */
  diagonalLocked?: boolean;
  /** Fill value for non-diagonal data cells. Default: empty string. */
  fill?: string;
  /** Whether to number headers 1..N. Default: true. */
  numberedHeaders?: boolean;
};

export type MatrixFillFn = (row: number, col: number, current: string) => string;

/**
 * Validates a cell draft while the user types.
 *
 * Return `true` to accept the new draft string, `false` to reject it
 * (previous draft is kept; invalid keystrokes never appear).
 *
 * Mid-edit may allow empty / partial values (e.g. `''` for integers).
 * On Enter/blur, `Matrix` still rejects empty or invalid drafts and
 * reverts to the last committed cell value.
 */
export type CellInputValidator = (raw: string, coord: CellCoord) => boolean;
