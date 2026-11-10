import { describe, expect, it } from "vitest";
import { createTask13Model } from "$lib/domain";
import {
  createLpMatrixModel,
  isLpNameHeader,
  isLpNumericCell,
  isLpUnitCell,
  modelSourceKey,
  modelThumbCells,
  modelToTableauCells,
  tableauToModel,
} from "./lp-tableau";

describe("lp-tableau units", () => {
  it("lays out a units row and a units column", () => {
    const model = createTask13Model();
    const cells = modelToTableauCells(model);
    const m = model.resources.length;
    const n = model.products.length;
    expect(cells).toHaveLength(m + 3);
    expect(cells[0]).toHaveLength(n + 3);
    expect(cells[1]!.slice(1, n + 1)).toEqual(model.product_units);
    expect(cells.slice(2, m + 2).map((r) => r[n + 2])).toEqual(
      model.resource_units,
    );
    expect(cells[m + 2]![0]).toBe("Цена");
  });

  it("classifies cells for the units layout", () => {
    const m = 3;
    const n = 4;
    expect(isLpUnitCell(1, 1, m, n)).toBe(true);
    expect(isLpUnitCell(2, n + 2, m, n)).toBe(true);
    expect(isLpUnitCell(1, n + 1, m, n)).toBe(false);
    expect(isLpNameHeader(2, 0, m, n)).toBe(true);
    expect(isLpNameHeader(1, 0, m, n)).toBe(false);
    expect(isLpNumericCell(2, n + 1, m, n)).toBe(true);
    expect(isLpNumericCell(m + 2, 1, m, n)).toBe(true);
    expect(isLpNumericCell(m + 2, n + 1, m, n)).toBe(false);
  });

  it("round-trips edited units and numbers through the matrix", () => {
    const model = createTask13Model();
    const n = model.products.length;
    const mm = createLpMatrixModel(model);
    mm.setValue(1, 1, "кг");
    mm.setValue(2, n + 2, "ч");
    mm.setValue(2, 1, "7");
    const next = tableauToModel(mm, model);
    expect(next.product_units![0]).toBe("кг");
    expect(next.resource_units![0]).toBe("ч");
    expect(next.A[0]![0]).toBe(7);
    expect(next.b).toEqual(model.b);
    expect(next.c).toEqual(model.c);
  });

  it("fills missing units with blanks and keys them", () => {
    const model = createTask13Model();
    delete model.product_units;
    delete model.resource_units;
    const next = tableauToModel(createLpMatrixModel(model), model);
    expect(next.product_units).toEqual(model.products.map(() => ""));
    expect(modelSourceKey(next)).toBe(modelSourceKey(model));
  });

  it("thumbnails omit the units row and column", () => {
    const model = createTask13Model();
    const { cells } = modelThumbCells(model, 10, 10);
    expect(cells).toHaveLength(model.resources.length + 2);
  });
});
