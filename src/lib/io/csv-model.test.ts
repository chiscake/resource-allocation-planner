import { describe, expect, it } from "vitest";
import { createTask13Model } from "$lib/domain";
import {
  csvModelTemplate,
  detectCsvDelimiter,
  parseModelCsv,
  serializeModelCsv,
} from "./csv-model";

function expectOk(text: string) {
  const res = parseModelCsv(text);
  if (!res.ok) throw new Error(`parse failed: ${res.error}`);
  return res;
}

describe("csv-model", () => {
  it("detects delimiters, preferring ; on ties", () => {
    expect(detectCsvDelimiter("a;b;c\n")).toBe(";");
    expect(detectCsvDelimiter("a,b,c\n")).toBe(",");
    expect(detectCsvDelimiter('"x;y",b,c\n')).toBe(",");
    expect(detectCsvDelimiter("abc\n")).toBe(";");
  });

  it("round-trips Task 13 with units through ; CSV", () => {
    const model = createTask13Model();
    const csv = serializeModelCsv(model, ";");
    const res = expectOk(csv);
    expect(res.delimiter).toBe(";");
    expect(res.model.resources).toEqual(model.resources);
    expect(res.model.products).toEqual(model.products);
    expect(res.model.A).toEqual(model.A);
    expect(res.model.b).toEqual(model.b);
    expect(res.model.c).toEqual(model.c);
    expect(res.model.resource_units).toEqual(model.resource_units);
    expect(res.model.product_units).toEqual(model.product_units);
    expect(res.model.objective_unit).toBe(model.objective_unit);
    expect(csv.startsWith("Ед. прибыли;у.е.")).toBe(true);
  });

  it("round-trips through , CSV with decimals", () => {
    const model = createTask13Model();
    model.A[0]![0] = 0.5;
    const res = expectOk(serializeModelCsv(model, ","));
    expect(res.delimiter).toBe(",");
    expect(res.model.A[0]![0]).toBe(0.5);
  });

  it("writes decimal commas for ; and reads them back", () => {
    const model = createTask13Model();
    model.b[1] = 12.25;
    const csv = serializeModelCsv(model, ";");
    expect(csv).toContain("12,25");
    expect(expectOk(csv).model.b[1]).toBe(12.25);
  });

  it("parses a minimal file without units, BOM and trailing delimiters", () => {
    const text =
      "\uFEFFРесурсы;A;B;Запас;;\r\nСталь;1;2;10;;\r\nТруд;3;1;12;;\r\n;;;;;\r\nЦена;5;4;;;\r\n";
    const { model } = expectOk(text);
    expect(model.products).toEqual(["A", "B"]);
    expect(model.resources).toEqual(["Сталь", "Труд"]);
    expect(model.A).toEqual([
      [1, 2],
      [3, 1],
    ]);
    expect(model.b).toEqual([10, 12]);
    expect(model.c).toEqual([5, 4]);
    expect(model.resource_units).toEqual(["", ""]);
    expect(model.product_units).toEqual(["", ""]);
    expect(model.objective_unit).toBe("");
  });

  it("parses the objective-unit meta line and aliases", () => {
    const text =
      "Ед. цели;тыс. руб.\r\nРесурсы;A;B;Запас;Ед. изм.\r\nЕд. изм.;шт;шт;;\r\nСталь;1;2;10;кг\r\nЦена;5;4;;\r\n";
    const { model } = expectOk(text);
    expect(model.objective_unit).toBe("тыс. руб.");
    expect(model.products).toEqual(["A", "B"]);
  });

  it("accepts ценность and доходность as the objective row", () => {
    const value = expectOk("x;A;B;Запас\nr1;1;1;4\nЦенность;5;4\n");
    expect(value.model.c).toEqual([5, 4]);
    const ret = expectOk("x;A;B;Запас\nr1;1;1;4\nДоходность;3;7\n");
    expect(ret.model.c).toEqual([3, 7]);
  });

  it("treats a header without a stock label as last column = stock", () => {
    const { model } = expectOk("x;p1;p2;b\nr1;1;1;4\nЦена;2;3\n");
    expect(model.b).toEqual([4]);
    expect(model.c).toEqual([2, 3]);
  });

  it("reports bad numbers with position", () => {
    const res = parseModelCsv("x;p1;Запас\nr1;abc;4\nЦена;1;\n");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("csvBadNumber");
      expect(res.vars).toMatchObject({ row: "2", col: "2", value: "abc" });
    }
  });

  it("requires a price row and resources", () => {
    expect(parseModelCsv("x;p1;Запас\nr1;1;4\nr2;1;4\n")).toMatchObject({
      ok: false,
      error: "csvMissingPrice",
    });
    expect(parseModelCsv("x;p1;Запас\nЦена;1;\n\n")).toMatchObject({
      ok: false,
      error: "csvTooFewRows",
    });
  });

  it("rejects models over the solve size limits", () => {
    const n = 201;
    const header = ["x", ...Array.from({ length: n }, (_, j) => `p${j}`), "Запас"];
    const row = ["r1", ...Array.from({ length: n }, () => "1"), "5"];
    const price = ["Цена", ...Array.from({ length: n }, () => "1"), ""];
    const res = parseModelCsv([header, row, price].map((r) => r.join(";")).join("\n"));
    expect(res).toMatchObject({ ok: false, error: "csvTooLarge" });
  });

  it("accepts a large 150×100 model", () => {
    const m = 150;
    const n = 100;
    const header = ["x", ...Array.from({ length: n }, (_, j) => `p${j}`), "Запас"];
    const rows = Array.from({ length: m }, (_, i) => [
      `r${i}`,
      ...Array.from({ length: n }, (_, j) => String(((i + j) % 5) + 1)),
      "1000",
    ]);
    const price = ["Цена", ...Array.from({ length: n }, (_, j) => String(j + 1)), ""];
    const { model } = expectOk([header, ...rows, price].map((r) => r.join(";")).join("\n"));
    expect(model.resources).toHaveLength(m);
    expect(model.products).toHaveLength(n);
  });

  it("template parses back into a valid model", () => {
    const { model } = expectOk(csvModelTemplate());
    expect(model.resources).toHaveLength(2);
    expect(model.products).toHaveLength(3);
    expect(model.resource_units).toEqual(["кг", "ч"]);
    expect(model.objective_unit).toBe("у.е.");
  });
});
