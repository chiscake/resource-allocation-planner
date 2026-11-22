import { SvelteMap } from 'svelte/reactivity';
import type {
  CellInputValidator,
  CellStyle,
  MatrixFillFn,
  MatrixFromSizeOptions,
  MatrixSnapshot,
} from './types';

function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

function cloneStyle(style: CellStyle): CellStyle {
  const next: CellStyle = {};
  if (style.bold !== undefined) next.bold = style.bold;
  if (style.background !== undefined) next.background = style.background;
  return next;
}

function mergeStyles(cell?: CellStyle, row?: CellStyle, col?: CellStyle): CellStyle {
  return {
    bold: cell?.bold ?? row?.bold ?? col?.bold ?? false,
    background: cell?.background ?? row?.background ?? col?.background,
  };
}

function emptyGrid(rows: number, cols: number, fill = ''): string[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => fill));
}

/**
 * Reactive matrix model for editable tables (ported from ОПР labs).
 *
 * Dimensions include the header row and column: a data size of N×M
 * uses `rows = N + 1`, `cols = M + 1`.
 */
export class MatrixModel {
  /** Total rows including header row. */
  rows = $state(1);
  /** Total columns including header column. */
  cols = $state(1);
  /** Full grid including headers; `cells[row][col]`. */
  cells = $state<string[][]>([['']]);

  /**
   * When true, data diagonal cells (`row === col`, both > 0) are not
   * UI-editable via `isEditable`. Programmatic `setValue` / loaders still work.
   */
  diagonalLocked = $state(true);

  /**
   * Optional draft validator for UI edits.
   * Overridden by `Matrix` props `validateInput` / `integerOnly` when set.
   * Does not affect programmatic `setValue` / loaders.
   */
  inputValidator = $state<CellInputValidator | undefined>(undefined);

  readonly #cellStyles = new SvelteMap<string, CellStyle>();
  readonly #rowStyles = new SvelteMap<number, CellStyle>();
  readonly #colStyles = new SvelteMap<number, CellStyle>();

  /** Bumps when style maps change so UI can re-read resolved styles. */
  styleVersion = $state(0);

  /** Bumps on every committed cell write so wrappers can sync outbound. */
  version = $state(0);

  constructor(rows = 1, cols = 1) {
    this.resize(rows, cols);
  }

  get dataRows(): number {
    return Math.max(0, this.rows - 1);
  }

  get dataCols(): number {
    return Math.max(0, this.cols - 1);
  }

  isHeader(row: number, col: number): boolean {
    return row === 0 || col === 0;
  }

  /** Data-region diagonal: `row === col` with both indices > 0. */
  isDiagonal(row: number, col: number): boolean {
    return row > 0 && col > 0 && row === col;
  }

  /**
   * Whether the UI may enter edit mode for this cell.
   * Respects `diagonalLocked`; does not block programmatic `setValue`.
   */
  isEditable(row: number, col: number): boolean {
    if (row <= 0 || col <= 0) return false;
    if (this.diagonalLocked && row === col) return false;
    return true;
  }

  getValue(row: number, col: number): string {
    this.#assertInBounds(row, col);
    return this.cells[row][col];
  }

  /**
   * Sets a cell value. Headers and locked diagonal are writable via API
   * (for loaders/presets/fillers); the UI only edits editable data cells.
   */
  setValue(row: number, col: number, value: string): void {
    this.#assertInBounds(row, col);
    this.cells[row][col] = value;
    this.version++;
  }

  setCorner(label: string): void {
    this.setValue(0, 0, label);
  }

  setRowHeader(index: number, label: string): void {
    if (index < 1 || index >= this.rows) {
      throw new RangeError(`Row header index out of range: ${index}`);
    }
    this.setValue(index, 0, label);
  }

  setColHeader(index: number, label: string): void {
    if (index < 1 || index >= this.cols) {
      throw new RangeError(`Column header index out of range: ${index}`);
    }
    this.setValue(0, index, label);
  }

  resize(rows: number, cols: number, fill = ''): void {
    if (rows < 1 || cols < 1) {
      throw new RangeError('Matrix must have at least 1 row and 1 column');
    }

    const next = emptyGrid(rows, cols, fill);
    const copyRows = Math.min(rows, this.rows);
    const copyCols = Math.min(cols, this.cols);

    for (let r = 0; r < copyRows; r++) {
      for (let c = 0; c < copyCols; c++) {
        next[r][c] = this.cells[r]?.[c] ?? fill;
      }
    }

    this.cells = next;
    this.rows = rows;
    this.cols = cols;
    this.#pruneStyles();
    this.version++;
  }

  /**
   * Replace the entire grid (including headers) from a 2D string array
   * or a full snapshot (values + styles).
   */
  load(data: string[][] | MatrixSnapshot): void {
    if (Array.isArray(data)) {
      this.#loadCells(data);
      return;
    }

    this.#loadCells(data.cells);
    this.clearStyles();
    for (const entry of data.cellStyles) {
      this.setCellStyle(entry.row, entry.col, entry.style);
    }
    for (const entry of data.rowStyles) {
      this.setRowStyle(entry.row, entry.style);
    }
    for (const entry of data.colStyles) {
      this.setColStyle(entry.col, entry.style);
    }
  }

  toArray(): string[][] {
    return this.cells.map((row) => [...row]);
  }

  /** Data region only (excludes headers), as a 2D string array. */
  toDataArray(): string[][] {
    return this.cells.slice(1).map((row) => row.slice(1));
  }

  export(): MatrixSnapshot {
    return {
      cells: this.toArray(),
      cellStyles: [...this.#cellStyles.entries()].map(([key, style]) => {
        const [row, col] = key.split(',').map(Number);
        return { row, col, style: cloneStyle(style) };
      }),
      rowStyles: [...this.#rowStyles.entries()].map(([row, style]) => ({
        row,
        style: cloneStyle(style),
      })),
      colStyles: [...this.#colStyles.entries()].map(([col, style]) => ({
        col,
        style: cloneStyle(style),
      })),
    };
  }

  setCellStyle(row: number, col: number, style: CellStyle): void {
    this.#assertInBounds(row, col);
    this.#cellStyles.set(cellKey(row, col), cloneStyle(style));
    this.styleVersion++;
  }

  setRowStyle(row: number, style: CellStyle): void {
    if (row < 0 || row >= this.rows) {
      throw new RangeError(`Row out of range: ${row}`);
    }
    this.#rowStyles.set(row, cloneStyle(style));
    this.styleVersion++;
  }

  setColStyle(col: number, style: CellStyle): void {
    if (col < 0 || col >= this.cols) {
      throw new RangeError(`Column out of range: ${col}`);
    }
    this.#colStyles.set(col, cloneStyle(style));
    this.styleVersion++;
  }

  clearStyles(): void {
    this.#cellStyles.clear();
    this.#rowStyles.clear();
    this.#colStyles.clear();
    this.styleVersion++;
  }

  getResolvedStyle(row: number, col: number): CellStyle {
    this.#assertInBounds(row, col);
    // Touch styleVersion so callers in templates re-run after style edits.
    void this.styleVersion;
    return mergeStyles(
      this.#cellStyles.get(cellKey(row, col)),
      this.#rowStyles.get(row),
      this.#colStyles.get(col),
    );
  }

  /**
   * Fill every cell (including headers) with a constant or function.
   */
  fill(valueOrFn: string | MatrixFillFn): void {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const current = this.cells[r][c];
        this.cells[r][c] = typeof valueOrFn === 'function' ? valueOrFn(r, c, current) : valueOrFn;
      }
    }
    this.version++;
  }

  /**
   * Fill only the data region (excluding headers) from a 2D string array.
   * Extra rows/cols in `data` are ignored; missing cells stay unchanged.
   */
  fillData(data: string[][]): void {
    for (let i = 0; i < data.length && i < this.dataRows; i++) {
      const src = data[i];
      for (let j = 0; j < src.length && j < this.dataCols; j++) {
        this.cells[i + 1][j + 1] = src[j];
      }
    }
    this.version++;
  }

  /** Number row/column headers as 1..N. */
  fillNumberedHeaders(): void {
    for (let i = 1; i < this.rows; i++) {
      this.cells[i][0] = String(i);
    }
    for (let j = 1; j < this.cols; j++) {
      this.cells[0][j] = String(j);
    }
    this.version++;
  }

  /** Set data diagonal cells (i, i) for i ≥ 1. */
  fillDiagonal(value: string): void {
    const n = Math.min(this.dataRows, this.dataCols);
    for (let i = 1; i <= n; i++) {
      this.cells[i][i] = value;
    }
    this.version++;
  }

  /**
   * Create an (N+1)×(N+1) matrix for an N×N data region.
   */
  static fromSize(n: number, options: MatrixFromSizeOptions = {}): MatrixModel {
    if (n < 0) throw new RangeError('Size must be non-negative');

    const {
      corner = '',
      diagonal,
      diagonalLocked = true,
      fill = '',
      numberedHeaders = true,
    } = options;

    const model = new MatrixModel(n + 1, n + 1);
    model.diagonalLocked = diagonalLocked;
    model.fill(fill);
    model.setCorner(corner);

    if (numberedHeaders) {
      model.fillNumberedHeaders();
    }
    if (diagonal !== undefined) {
      model.fillDiagonal(diagonal);
    }

    return model;
  }

  static fromArray(cells: string[][]): MatrixModel {
    const model = new MatrixModel(1, 1);
    model.load(cells);
    return model;
  }

  static fromSnapshot(snapshot: MatrixSnapshot): MatrixModel {
    const model = new MatrixModel(1, 1);
    model.load(snapshot);
    return model;
  }

  #loadCells(cells: string[][]): void {
    if (cells.length === 0) {
      throw new Error('Cannot load an empty matrix');
    }
    const cols = cells[0]?.length ?? 0;
    if (cols === 0) {
      throw new Error('Cannot load a matrix with zero columns');
    }
    for (const row of cells) {
      if (row.length !== cols) {
        throw new Error('All matrix rows must have the same length');
      }
    }
    this.rows = cells.length;
    this.cols = cols;
    this.cells = cells.map((row) => [...row]);
    this.#pruneStyles();
    this.version++;
  }

  #pruneStyles(): void {
    for (const key of [...this.#cellStyles.keys()]) {
      const [row, col] = key.split(',').map(Number);
      if (row >= this.rows || col >= this.cols) {
        this.#cellStyles.delete(key);
      }
    }
    for (const row of [...this.#rowStyles.keys()]) {
      if (row >= this.rows) this.#rowStyles.delete(row);
    }
    for (const col of [...this.#colStyles.keys()]) {
      if (col >= this.cols) this.#colStyles.delete(col);
    }
    this.styleVersion++;
  }

  #assertInBounds(row: number, col: number): void {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) {
      throw new RangeError(`Cell out of range: (${row}, ${col})`);
    }
  }
}
