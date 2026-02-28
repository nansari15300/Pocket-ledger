"use client";

import * as XLSX from "xlsx";
import type { EntityConfig, EntityColumn } from "./entityConfig";

/**
 * Build Excel sheet from rows (array of record with keys matching column keys).
 * Headers use column.header.
 */
export function buildSheetFromRows(
  columns: EntityColumn[],
  rows: Record<string, unknown>[]
): XLSX.WorkSheet {
  const headers = columns.map((c) => c.header);
  const data = rows.map((row) =>
    columns.map((col) => {
      const raw = row[col.key];
      const formatted = col.format ? col.format(raw) : raw;
      return formatted ?? "";
    })
  );
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  return ws;
}

/**
 * Create a workbook with one sheet and trigger download.
 */
export function downloadExcel(worksheet: XLSX.WorkSheet, fileName: string) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, worksheet, "Data");
  XLSX.writeFile(wb, fileName);
}

/**
 * Create a workbook with multiple sheets (category-wise) and trigger download.
 */
export function downloadExcelWorkbook(
  sheets: { sheetName: string; worksheet: XLSX.WorkSheet }[],
  fileName: string
) {
  const wb = XLSX.utils.book_new();
  sheets.forEach(({ sheetName, worksheet }) => {
    XLSX.utils.book_append_sheet(wb, worksheet, sheetName.slice(0, 31));
  });
  XLSX.writeFile(wb, fileName);
}

/**
 * Parse first sheet of an Excel file to array of row objects (keys = column headers).
 * Normalizes headers to match config keys by matching header string (case-insensitive, trim).
 */
export function parseExcelToRows(
  file: File,
  columns: EntityColumn[]
): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          reject(new Error("Failed to read file"));
          return;
        }
        const wb = XLSX.read(data, { type: "binary" });
        const firstSheet = wb.SheetNames[0];
        if (!firstSheet) {
          resolve([]);
          return;
        }
        const ws = wb.Sheets[firstSheet];
        const rows = sheetToRowsWithColumns(ws, columns);
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsBinaryString(file);
  });
}

/** Parse one worksheet to rows using given column definitions. */
export function sheetToRowsWithColumns(
  ws: XLSX.WorkSheet,
  columns: EntityColumn[]
): Record<string, unknown>[] {
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { header: 1 });
  if (json.length < 2) return [];
  const headerRow = (json[0] as unknown[]) as string[];
  const keyToIndex: Record<string, number> = {};
  columns.forEach((col) => {
    const idx = headerRow.findIndex(
      (h) => String(h).trim().toLowerCase() === col.header.trim().toLowerCase()
    );
    if (idx >= 0) keyToIndex[col.key] = idx;
  });
  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < json.length; i++) {
    const rowArr = (json[i] as unknown[]) ?? [];
    const row: Record<string, unknown> = {};
    columns.forEach((col) => {
      const idx = keyToIndex[col.key];
      if (idx !== undefined && rowArr[idx] !== undefined && rowArr[idx] !== "") {
        row[col.key] = rowArr[idx];
      }
    });
    if (Object.keys(row).length > 0) rows.push(row);
  }
  return rows;
}

/**
 * Parse all sheets of an Excel file. For each sheet, getColumns is called to get column config; if it returns undefined, the sheet is skipped.
 * Returns array of { sheetName, entityId, rows } for each recognized category sheet.
 */
export function parseExcelWorkbookToSheets(
  file: File,
  getColumnsForSheetName: (sheetName: string) => EntityColumn[] | undefined,
  getEntityIdForSheetName: (sheetName: string) => string | undefined
): Promise<{ sheetName: string; entityId: string; rows: Record<string, unknown>[] }[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          reject(new Error("Failed to read file"));
          return;
        }
        const wb = XLSX.read(data, { type: "binary" });
        const result: { sheetName: string; entityId: string; rows: Record<string, unknown>[] }[] = [];
        for (const sheetName of wb.SheetNames) {
          const columns = getColumnsForSheetName(sheetName);
          const entityId = getEntityIdForSheetName(sheetName);
          if (!columns || !entityId) continue;
          const ws = wb.Sheets[sheetName];
          const rows = sheetToRowsWithColumns(ws, columns);
          result.push({ sheetName, entityId, rows });
        }
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsBinaryString(file);
  });
}

/**
 * Build template sheet for an entity: headers + one example row (empty or sample).
 */
export function buildTemplateSheet(config: EntityConfig, includeExampleRow: boolean): XLSX.WorkSheet {
  const exampleRow: Record<string, unknown> = {};
  config.columns.forEach((col) => {
    if (includeExampleRow) {
      if (col.key === "name" || col.key === "accountName") exampleRow[col.key] = "Example Name";
      else if (col.key === "groupName" || col.key === "Group") exampleRow[col.key] = "My Group";
      else if (col.key === "openingBalance" || col.key === "rate" || col.key === "salePrice" || col.key === "purchasePrice" || col.key === "amount") exampleRow[col.key] = 0;
      else exampleRow[col.key] = "";
    } else {
      exampleRow[col.key] = "";
    }
  });
  const rows = includeExampleRow ? [exampleRow] : [];
  return buildSheetFromRows(config.columns, rows);
}

/**
 * Convert Firestore document to export row (e.g. add groupName from groupId lookup).
 */
export function docToExportRow(
  doc: Record<string, unknown>,
  config: EntityConfig,
  groupNameById: Record<string, string>
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  config.columns.forEach((col) => {
    const field = col.field ?? col.key;
    let value = doc[field];
    if (col.key === "groupName" && config.groupCollection && doc.groupId) {
      value = groupNameById[String(doc.groupId)] ?? doc.groupId;
    }
    if (value != null && typeof (value as { toDate?: () => Date }).toDate === "function") {
      value = (value as { toDate: () => Date }).toDate().toISOString().slice(0, 10);
    }
    if (value != null && col.format) value = col.format(value);
    row[col.key] = value ?? "";
  });
  return row;
}
