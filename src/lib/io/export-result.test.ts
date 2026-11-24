import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  applyMutation,
  buildDefaultMutations,
  buildWhatIfRowData,
  createTask13Model,
} from '$lib/domain';
import { solveLocal } from '$lib/solver';
import {
  buildExcelBlob,
  buildPdfBlob,
  objRangesTable,
  planTable,
  resourceTable,
  rhsRangesTable,
  whatIfTable,
  type ExportPayload,
} from './export-result';

function fontBase64(name: string): string {
  const path = fileURLToPath(new URL(`./fonts/${name}`, import.meta.url));
  return readFileSync(path).toString('base64');
}

async function task13Payload(): Promise<ExportPayload> {
  const model = createTask13Model();
  const res = solveLocal(model, 'local', 0, 'lp', 'native');
  const result = res.result!;
  const whatIfRows = buildDefaultMutations(model)
    .slice(0, 3)
    .map((mutation) => {
      const mutatedModel = applyMutation(model, mutation);
      const r = solveLocal(mutatedModel, 'local', 0, 'lp', 'native');
      return buildWhatIfRowData({
        base: model,
        baseResult: result,
        mutation,
        mutatedModel,
        result: r.result,
      });
    });
  return {
    title: 'Задача 13 / тест',
    method: 'lp',
    result,
    model,
    whatIfRows,
    solverLibrary: 'simplex-native@local',
    solvedAt: new Date('2026-11-10T10:00:00Z'),
  };
}

describe('export-result', () => {
  it('builds plan / resource / what-if tables with units', async () => {
    const p = await task13Payload();
    const plan = planTable(p);
    expect(plan.body).toHaveLength(p.model.products.length);
    expect(String(plan.body[0]![0])).toContain(p.model.product_units![0]!);
    expect(String(plan.body[0]![3])).toContain(p.model.product_units![0]!);
    const res = resourceTable(p);
    expect(String(res.body[0]![0])).toContain(p.model.resource_units![0]!);
    expect(res.body[0]![2]).toBe(p.model.b[0]);
    expect(whatIfTable(p).body).toHaveLength(3);
    expect(whatIfTable(p).head).not.toContain('Базис сменился');
    expect(whatIfTable(p).body[0]).toHaveLength(whatIfTable(p).head.length);
    expect(rhsRangesTable(p)?.body).toHaveLength(p.model.resources.length);
    expect(objRangesTable(p)?.body).toHaveLength(p.model.products.length);
    expect(rhsRangesTable(p)?.body[0]?.[4]).toBeCloseTo(65, 5);
  });

  it('writes an xlsx workbook that reads back', async () => {
    const p = await task13Payload();
    const { blob, filename } = await buildExcelBlob(p);
    expect(filename).toBe('Задача_13_тест.xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Сводка',
      'Ресурсы',
      'Чувствительность',
      'Интервалы b',
      'Интервалы c',
    ]);
    const summary = wb.getWorksheet('Сводка')!;
    expect(summary.getCell('A1').value).toBe('Задача');
    expect(summary.getCell('B4').value).toBeCloseTo(p.result.Z, 6);
    const whatIf = wb.getWorksheet('Чувствительность')!;
    expect(whatIf.rowCount).toBe(4);
  });

  it('omits the what-if sheet when there are no scenarios', async () => {
    const p = { ...(await task13Payload()), whatIfRows: [] };
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await (await buildExcelBlob(p)).blob.arrayBuffer());
    // Summary + resources + two range sheets (ranges do not need pack rows).
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Сводка',
      'Ресурсы',
      'Интервалы b',
      'Интервалы c',
    ]);
  });

  it('writes a PDF with an embedded Cyrillic font', async () => {
    const p = await task13Payload();
    const { blob, filename } = buildPdfBlob(p, {
      regular: fontBase64('NotoSans-Regular.ttf'),
      bold: fontBase64('NotoSans-Bold.ttf'),
    });
    expect(filename).toBe('Задача_13_тест.pdf');
    const bytes = Buffer.from(await blob.arrayBuffer());
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(bytes.toString('latin1')).toContain('NotoSans');
    expect(bytes.length).toBeGreaterThan(10_000);
  });
});
