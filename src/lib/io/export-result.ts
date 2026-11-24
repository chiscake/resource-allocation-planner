import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Model, SolveMethod, SolveResult, WhatIfRowData } from '$lib/domain';
import {
  labeledProduct,
  labeledResource,
  objectiveUnit,
  priceUnit,
  shadowUnit,
} from '$lib/display/units';
import { computeSensitivityRanges } from '$lib/solver';
import { t, type RuKey } from '$lib/i18n';
import { safeFilename } from './download';

export type ExportPayload = {
  title: string;
  method: SolveMethod;
  result: SolveResult;
  model: Model;
  whatIfRows?: WhatIfRowData[];
  roundPlan?: boolean;
  solverLibrary?: string | null;
  solvedAt?: Date;
};

/** Base64 TTF payloads; jsPDF core fonts have no Cyrillic. */
export type PdfFonts = { regular: string; bold: string };

type Cell = string | number | null;
type Table = { head: string[]; body: Cell[][] };

const METHOD_KEY: Record<SolveMethod, RuKey> = {
  lp: 'methodLp',
  ipm: 'methodIpm',
  ga: 'methodGa',
  dln: 'methodDln',
};

/** Round to 2 decimal places for export; non-finite → null (rendered as «—»). ±∞ → string. */
function num(v: number | undefined | null): number | string | null {
  if (v == null) return null;
  if (v === Number.POSITIVE_INFINITY) return '∞';
  if (v === Number.NEGATIVE_INFINITY) return '−∞';
  if (!Number.isFinite(v)) return null;
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

const ruNumber = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function text(v: Cell): string {
  if (v == null) return '—';
  return typeof v === 'number' ? ruNumber.format(v) : v;
}

function withUnitHeader(label: string, unit: string): string {
  return unit ? `${label}, ${unit}` : label;
}

function summaryRows(p: ExportPayload): [string, Cell][] {
  const obj = objectiveUnit(p.model);
  const rows: [string, Cell][] = [
    [t('exportTask'), p.title || t('newTask')],
    [t('exportMethod'), t(METHOD_KEY[p.method])],
    [t('exportDate'), (p.solvedAt ?? new Date()).toLocaleString('ru-RU')],
    [t('zMax'), num(p.result.Z)],
    ...(obj ? ([[t('objectiveUnit'), obj]] as [string, Cell][]) : []),
    [t('compareFeasible'), p.result.feasible ? t('compareYes') : t('compareNo')],
    [
      t('criticalResources'),
      p.result.critical_resources.length
        ? p.result.critical_resources.map((name) => labeledResource(p.model, name)).join(', ')
        : '—',
    ],
  ];
  if (p.roundPlan) rows.push([t('roundPlan'), t('compareYes')]);
  if (p.solverLibrary) rows.push([t('solverLibrary'), p.solverLibrary]);
  return rows;
}

export function planTable(p: ExportPayload): Table {
  const { model, result } = p;
  return {
    head: [t('exportProduct'), t('exportQuantity'), t('matrixPrice'), t('exportPriceUnit')],
    body: model.products.map((name, j) => [
      labeledProduct(model, j),
      num(result.x[name] ?? 0),
      num(model.c[j]),
      priceUnit(model, j),
    ]),
  };
}

export function resourceTable(p: ExportPayload): Table {
  const { model, result } = p;
  const critical = new Set(result.critical_resources);
  return {
    head: [
      t('exportResource'),
      t('exportUsage'),
      t('matrixStock'),
      t('exportSlack'),
      t('shadowPrices'),
      t('exportShadowUnit'),
      t('exportCritical'),
    ],
    body: model.resources.map((name, i) => [
      labeledResource(model, i),
      num(result.resource_usage?.[name]),
      num(model.b[i]),
      num(result.resource_slack?.[name]),
      num(result.shadow_prices?.[name]),
      shadowUnit(model, i),
      critical.has(name) ? t('compareYes') : t('compareNo'),
    ]),
  };
}

export function whatIfTable(p: ExportPayload): Table {
  const obj = objectiveUnit(p.model);
  return {
    head: [
      t('exportScenario'),
      t('mutationBefore'),
      t('mutationAfter'),
      withUnitHeader(t('zMax'), obj),
      withUnitHeader(t('whatIfDeltaZ'), obj),
      t('whatIfShadowCol'),
      t('exportBasisChanged'),
    ],
    body: (p.whatIfRows ?? []).map((r) => [
      r.title,
      r.before,
      r.after,
      num(r.Z),
      num(r.deltaZ),
      num(r.shadowMetric),
      r.basisChanged ? t('compareYes') : t('compareNo'),
    ]),
  };
}

export function rhsRangesTable(p: ExportPayload): Table | null {
  const sens = computeSensitivityRanges(p.model);
  if (!sens) return null;
  return {
    head: [
      t('exportResource'),
      t('sensitivityColCurrent'),
      t('sensitivityColAllowDec'),
      t('sensitivityColAllowInc'),
      t('sensitivityColLower'),
      t('sensitivityColUpper'),
      t('sensitivityColShadow'),
    ],
    body: sens.rhs.map((r) => [
      labeledResource(p.model, r.index),
      num(r.current),
      num(r.allowDecrease),
      num(r.allowIncrease),
      num(r.lower),
      num(r.upper),
      num(r.shadowPrice),
    ]),
  };
}

export function objRangesTable(p: ExportPayload): Table | null {
  const sens = computeSensitivityRanges(p.model);
  if (!sens) return null;
  return {
    head: [
      t('exportProduct'),
      t('sensitivityColCurrent'),
      t('sensitivityColAllowDec'),
      t('sensitivityColAllowInc'),
      t('sensitivityColLower'),
      t('sensitivityColUpper'),
      t('sensitivityColReducedCost'),
    ],
    body: sens.objective.map((r) => [
      labeledProduct(p.model, r.index),
      num(r.current),
      num(r.allowDecrease),
      num(r.allowIncrease),
      num(r.lower),
      num(r.upper),
      num(r.reducedCost),
    ]),
  };
}

const HEAD_FILL = 'FFEFF6FF';
const BORDER = 'FFE5E5E5';
const NUM_FMT = '#,##0.00';

function addSheetTable(ws: ExcelJS.Worksheet, table: Table, startRow: number): number {
  const head = ws.getRow(startRow);
  head.values = table.head;
  head.font = { bold: true };
  head.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_FILL } };
    c.border = { bottom: { style: 'thin', color: { argb: BORDER } } };
  });
  table.body.forEach((cells, i) => {
    const row = ws.getRow(startRow + 1 + i);
    row.values = cells.map((v) => (v == null ? '—' : v));
    row.eachCell((c) => {
      if (typeof c.value === 'number') c.numFmt = NUM_FMT;
    });
  });
  return startRow + table.body.length + 1;
}

function fitColumns(ws: ExcelJS.Worksheet, min = 10, max = 48): void {
  ws.columns.forEach((col) => {
    let width = min;
    col.eachCell?.({ includeEmpty: false }, (c) => {
      width = Math.max(width, String(c.value ?? '').length + 2);
    });
    col.width = Math.min(max, width);
  });
}

export async function buildExcelBlob(p: ExportPayload): Promise<{ blob: Blob; filename: string }> {
  const wb = new ExcelJS.Workbook();
  wb.creator = t('appTitle');
  wb.created = p.solvedAt ?? new Date();

  const summary = wb.addWorksheet(t('exportSheetSummary'));
  summaryRows(p).forEach(([label, value], i) => {
    const row = summary.getRow(i + 1);
    row.values = [label, value ?? '—'];
    row.getCell(1).font = { bold: true };
    if (typeof value === 'number') row.getCell(2).numFmt = NUM_FMT;
  });
  const next = summaryRows(p).length + 2;
  summary.getRow(next).getCell(1).value = t('guestPlan');
  summary.getRow(next).getCell(1).font = { bold: true, size: 12 };
  addSheetTable(summary, planTable(p), next + 1);
  fitColumns(summary);

  const resources = wb.addWorksheet(t('exportSheetResources'));
  addSheetTable(resources, resourceTable(p), 1);
  resources.views = [{ state: 'frozen', ySplit: 1 }];
  fitColumns(resources);

  const whatIf = whatIfTable(p);
  if (whatIf.body.length) {
    const ws = wb.addWorksheet(t('exportSheetWhatIf'));
    addSheetTable(ws, whatIf, 1);
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    fitColumns(ws);
  }

  const rhsRanges = rhsRangesTable(p);
  if (rhsRanges?.body.length) {
    const ws = wb.addWorksheet(t('exportSheetRhsRanges'));
    addSheetTable(ws, rhsRanges, 1);
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    fitColumns(ws);
  }

  const objRanges = objRangesTable(p);
  if (objRanges?.body.length) {
    const ws = wb.addWorksheet(t('exportSheetObjRanges'));
    addSheetTable(ws, objRanges, 1);
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    fitColumns(ws);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return {
    blob: new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename: safeFilename(p.title, 'xlsx', 'result'),
  };
}

const PDF_FONT = 'NotoSans';
const INK: [number, number, number] = [10, 10, 10];
const MUTED: [number, number, number] = [82, 82, 82];
const BRAND: [number, number, number] = [37, 99, 235];
const HEAD_BG: [number, number, number] = [239, 246, 255];
const LINE: [number, number, number] = [229, 229, 229];

export function buildPdfBlob(p: ExportPayload, fonts: PdfFonts): { blob: Blob; filename: string } {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.addFileToVFS('NotoSans-Regular.ttf', fonts.regular);
  doc.addFont('NotoSans-Regular.ttf', PDF_FONT, 'normal');
  doc.addFileToVFS('NotoSans-Bold.ttf', fonts.bold);
  doc.addFont('NotoSans-Bold.ttf', PDF_FONT, 'bold');
  doc.setProperties({ title: p.title, creator: t('appTitle') });

  const margin = 40;
  const width = doc.internal.pageSize.getWidth() - margin * 2;
  let y = margin;

  doc.setFont(PDF_FONT, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(t('appTitle'), margin, y);
  y += 22;

  doc.setFont(PDF_FONT, 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...INK);
  const titleLines = doc.splitTextToSize(p.title || t('newTask'), width) as string[];
  doc.text(titleLines, margin, y);
  y += titleLines.length * 22;

  doc.setFont(PDF_FONT, 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(t('exportProfitZMax'), margin, y);
  doc.setFont(PDF_FONT, 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...BRAND);
  const zText = text(num(p.result.Z));
  doc.text(zText, margin, y + 24);
  const obj = objectiveUnit(p.model);
  if (obj) {
    const zWidth = doc.getTextWidth(zText);
    doc.setFont(PDF_FONT, 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...MUTED);
    doc.text(obj, margin + zWidth + 8, y + 24);
  }
  y += 44;

  const tableStyles = {
    font: PDF_FONT,
    fontSize: 9,
    textColor: INK,
    lineColor: LINE,
    lineWidth: 0.5,
    cellPadding: 4,
  };
  const headStyles = { fillColor: HEAD_BG, textColor: INK, fontStyle: 'bold' as const };
  const lastY = () => (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  const pdfSummarySkip = new Set([
    t('exportTask'),
    t('exportMethod'),
    t('zMax'),
    t('objectiveUnit'),
    t('solverLibrary'),
  ]);
  autoTable(doc, {
    startY: y,
    body: summaryRows(p)
      .filter(([label]) => !pdfSummarySkip.has(label))
      .map(([label, value]) => [label, text(value)]),
    theme: 'plain',
    styles: { ...tableStyles, lineWidth: 0 },
    columnStyles: { 0: { textColor: MUTED, cellWidth: 150 } },
    margin: { left: margin, right: margin },
  });
  y = lastY() + 10;

  const methodHint = [t(METHOD_KEY[p.method]), p.solverLibrary].filter(Boolean).join(' · ');
  doc.setFont(PDF_FONT, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(methodHint, margin, y);
  y += 18;

  const section = (label: string, table: Table) => {
    if (y > doc.internal.pageSize.getHeight() - 120) {
      doc.addPage();
      y = margin;
    }
    doc.setFont(PDF_FONT, 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...INK);
    doc.text(label, margin, y);
    autoTable(doc, {
      startY: y + 8,
      head: [table.head],
      body: table.body.map((row) => row.map(text)),
      theme: 'grid',
      styles: tableStyles,
      headStyles,
      margin: { left: margin, right: margin },
    });
    y = lastY() + 22;
  };

  section(t('guestPlan'), planTable(p));
  section(t('exportSheetResources'), resourceTable(p));
  const whatIf = whatIfTable(p);
  if (whatIf.body.length) section(t('exportSheetWhatIf'), whatIf);
  const rhsRanges = rhsRangesTable(p);
  if (rhsRanges?.body.length) section(t('exportSheetRhsRanges'), rhsRanges);
  const objRanges = objRangesTable(p);
  if (objRanges?.body.length) section(t('exportSheetObjRanges'), objRanges);

  return { blob: doc.output('blob'), filename: safeFilename(p.title, 'pdf', 'result') };
}
