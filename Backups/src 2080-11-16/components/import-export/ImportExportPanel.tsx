"use client";

import { useState, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowDownToLine, ArrowUpFromLine, FileSpreadsheet, Loader2, ChevronLeft } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import {
  collection,
  getDocs,
  query,
  addDoc,
  serverTimestamp,
  doc,
  setDoc,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import {
  ENTITY_CONFIGS,
  getEntityConfig,
  getCollectionForAccountType,
} from "@/lib/import-export/entityConfig";
import {
  buildSheetFromRows,
  downloadExcel,
  downloadExcelWorkbook,
  parseExcelToRows,
  buildTemplateSheet,
} from "@/lib/import-export/excelUtils";
import {
  exportAccountMaster,
  buildAccountMasterTemplateRow,
  buildAccountDocFromRow,
} from "@/lib/import-export/accountMasterExport";
import {
  exportVouchersByTabs,
  buildVoucherTemplateSheets,
  parseVoucherWorkbook,
  importVouchers,
  VOUCHER_COLUMNS,
} from "@/lib/import-export/voucherExportImport";
import { levenshteinSimilarity, FUZZY_MERGE_THRESHOLD } from "@/lib/import-export/fuzzyMatch";
import usePermissions from "@/hooks/usePermissions";
import { assertCan, PermissionDeniedError } from "@/lib/permissions/enforcePermission";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";

type Mode = "import" | "export" | null;

export function ImportExportPanel() {
  const { companyId, company } = useCompany();
  const { user } = useAuth();
  const { toast } = useToast();
  const { can } = usePermissions();

  const [mode, setMode] = useState<Mode>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string>("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const [fuzzyDialog, setFuzzyDialog] = useState<{
    open: boolean;
    importedName: string;
    existingId: string;
    existingName: string;
    rowIndex: number;
    resolve: (choice: "merge" | "keep") => void;
  } | null>(null);

  const handleExport = useCallback(async () => {
    if (!companyId || !selectedEntityId) return;
    try {
      assertCan(can, "export_data");
    } catch (e) {
      if (e instanceof PermissionDeniedError) {
        toast({ variant: "destructive", title: "Permission Denied", description: e.message });
      }
      return;
    }
    const config = getEntityConfig(selectedEntityId);
    if (!config) return;
    setIsExporting(true);
    try {
      if (selectedEntityId === "vouchers") {
        const tabs = await exportVouchersByTabs(companyId);
        const sheets = tabs.map(({ sheetName, rows }) => ({
          sheetName,
          worksheet: buildSheetFromRows(VOUCHER_COLUMNS, rows),
        }));
        const name = `Vouchers_${new Date().toISOString().slice(0, 10)}.xlsx`;
        downloadExcelWorkbook(sheets, name);
        const total = tabs.reduce((acc, t) => acc + t.rows.length, 0);
        toast({ title: "Export done", description: `${total} vouchers in ${sheets.length} tabs.` });
      } else {
        const rows =
          selectedEntityId === "account_master" ? await exportAccountMaster(companyId) : [];
        const ws = buildSheetFromRows(config.columns, rows);
        const name = `${config.label.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        downloadExcel(ws, name);
        toast({ title: "Export done", description: `${rows.length} rows exported.` });
      }
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Export failed", description: String(e) });
    } finally {
      setIsExporting(false);
    }
  }, [companyId, selectedEntityId, can, toast]);

  const handleDownloadTemplate = useCallback(() => {
    if (!selectedEntityId) return;
    const config = getEntityConfig(selectedEntityId);
    if (!config) return;
    if (selectedEntityId === "vouchers") {
      const tabs = buildVoucherTemplateSheets();
      const sheets = tabs.map(({ sheetName, rows }) => ({
        sheetName,
        worksheet: buildSheetFromRows(VOUCHER_COLUMNS, rows),
      }));
      downloadExcelWorkbook(sheets, "Import_Template_Vouchers.xlsx");
      toast({ title: "Template downloaded", description: "One tab per voucher type. Fill Type column and import." });
    } else {
      const ws =
        selectedEntityId === "account_master"
          ? buildSheetFromRows(config.columns, [buildAccountMasterTemplateRow()])
          : buildTemplateSheet(config, true);
      downloadExcel(ws, `Import_Template_${config.label.replace(/\s+/g, "_")}.xlsx`);
      toast({ title: "Template downloaded", description: "Fill the file and import it here." });
    }
  }, [selectedEntityId, toast]);

  const handleImport = useCallback(async () => {
    if (!companyId || !selectedEntityId || !importFile || !user?.uid) return;
    try {
      assertCan(can, "import_data");
    } catch (e) {
      if (e instanceof PermissionDeniedError) {
        toast({ variant: "destructive", title: "Permission Denied", description: e.message });
      }
      return;
    }
    setIsImporting(true);
    const file = importFile;
    setImportFile(null);
    const ownerId = (company as { ownerId?: string })?.ownerId ?? user.uid;
    try {
      const config = getEntityConfig(selectedEntityId);
      if (!config) return;
      if (selectedEntityId === "vouchers") {
        const voucherRows = await parseVoucherWorkbook(file);
        if (!voucherRows.length) {
          toast({ variant: "destructive", title: "No data", description: "No voucher rows in recognized tabs." });
          return;
        }
        const required = [
          { key: "date", header: "Date" },
          { key: "voucherNumber", header: "Voucher No." },
          { key: "voucherType", header: "Type" },
          { key: "drAccount", header: "Dr Account" },
          { key: "crAccount", header: "Cr Account" },
          { key: "amount", header: "Amount" },
        ];
        for (let i = 0; i < voucherRows.length; i++) {
          for (const col of required) {
            const v = voucherRows[i][col.key];
            if (v === undefined || v === null || String(v).trim() === "") {
              toast({
                variant: "destructive",
                title: "Validation failed",
                description: `Row ${i + 2}: "${col.header}" is required.`,
              });
              return;
            }
          }
        }
        const { created } = await importVouchers(companyId, ownerId, voucherRows);
        toast({ title: "Import done", description: `${created} vouchers created.` });
        return;
      }
      const rows = await parseExcelToRows(file, config.columns);
      if (!rows.length) {
        toast({ variant: "destructive", title: "No data", description: "The file has no valid rows." });
        return;
      }
      const required = config.columns.filter((c) => c.required);
      for (let i = 0; i < rows.length; i++) {
        for (const col of required) {
          const v = rows[i][col.key];
          if (v === undefined || v === null || String(v).trim() === "") {
            toast({
              variant: "destructive",
              title: "Validation failed",
              description: `Row ${i + 2}: "${col.header}" is required.`,
            });
            return;
          }
        }
      }
      if (selectedEntityId === "account_master") {
        const existingByCol = new Map<string, { id: string; name: string }[]>();
        const getExisting = async (col: string, nameKey: string) => {
          if (existingByCol.has(col)) return existingByCol.get(col)!;
          const snap = await getDocs(query(collection(firestore, `companies/${companyId}/${col}`)));
          const list = snap.docs.map((d) => {
            const data = d.data() as Record<string, string>;
            return { id: d.id, name: String(data[nameKey] ?? data.name ?? d.id).trim().toLowerCase() };
          });
          existingByCol.set(col, list);
          return list;
        };
        const groupCache = new Map<string, Record<string, string>>();
        const getOrCreateGroup = async (groupCol: string, groupName: string) => {
          const key = `${groupCol}:${groupName.trim().toLowerCase()}`;
          if (!groupCache.has(groupCol)) groupCache.set(groupCol, {});
          const cache = groupCache.get(groupCol)!;
          const gKey = groupName.trim().toLowerCase();
          if (cache[gKey]) return cache[gKey];
          const snap = await getDocs(query(collection(firestore, `companies/${companyId}/${groupCol}`)));
          snap.docs.forEach((d) => {
            const n = String((d.data() as { name?: string }).name ?? d.id).trim().toLowerCase();
            cache[n] = d.id;
          });
          if (cache[gKey]) return cache[gKey];
          const newRef = doc(collection(firestore, `companies/${companyId}/${groupCol}`));
          setDoc(newRef, {
            name: groupName.trim(),
            companyId,
            debit: 0,
            credit: 0,
            balance: 0,
          });
          cache[gKey] = newRef.id;
          return newRef.id;
        };
        let created = 0;
        let merged = 0;
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const type = String(row.type ?? "").trim();
          const name = String(row.name ?? "").trim();
          if (!type || !name) continue;
          const meta = getCollectionForAccountType(type);
          if (!meta) continue;
          const existingList = await getExisting(meta.collection, meta.nameKey);
          const nameLower = name.toLowerCase();
          const exact = existingList.find((e) => e.name === nameLower);
          let existingId: string | null = null;
          if (exact) {
            existingId = exact.id;
            merged++;
          } else {
            const best = existingList.reduce<{ id: string; name: string; sim: number } | null>((best, e) => {
              const sim = levenshteinSimilarity(name, e.name);
              if (sim >= FUZZY_MERGE_THRESHOLD && (!best || sim > best.sim)) return { id: e.id, name: e.name, sim };
              return best;
            }, null);
            if (best) {
              const result = await new Promise<"merge" | "keep">((resolve) => {
                setFuzzyDialog({
                  open: true,
                  importedName: name,
                  existingId: best.id,
                  existingName: best.name,
                  rowIndex: i,
                  resolve,
                });
              });
              setFuzzyDialog(null);
              if (result === "merge") {
                existingId = best.id;
                merged++;
              }
            }
          }
          let groupId: string | undefined;
          const groupName = row.groupName as string | undefined;
          if (groupName && meta.groupCollection) {
            groupId = await getOrCreateGroup(meta.groupCollection, String(groupName));
          }
          const colRef = collection(firestore, `companies/${companyId}/${meta.collection}`);
          const docData = buildAccountDocFromRow(type, row, groupId, companyId, ownerId);
          if (existingId) {
            const { balance: _b, debit: _d, credit: _c, ...updateData } = docData as Record<string, unknown>;
            await setDoc(doc(firestore, `companies/${companyId}/${meta.collection}`, existingId), { ...updateData, updatedAt: serverTimestamp() }, { merge: true });
          } else {
            const newRef = await addDoc(colRef, { ...docData, createdAt: serverTimestamp() });
            existingList.push({ id: newRef.id, name: nameLower });
            created++;
          }
        }
        toast({ title: "Import done", description: `Created: ${created}, Updated: ${merged}.` });
        return;
      }
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Import failed", description: String(e) });
    } finally {
      setIsImporting(false);
    }
  }, [companyId, selectedEntityId, importFile, can, toast, user?.uid, company]);

  const supportsImport = !!selectedEntityId;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Import / Export</h1>
        <p className="text-muted-foreground">
          Export data to Excel or import from Excel using the same template format.
        </p>
      </div>

      {mode === null && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card
            className="cursor-pointer transition-shadow hover:shadow-md"
            onClick={() => setMode("import")}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowDownToLine className="h-5 w-5" />
                Import
              </CardTitle>
              <CardDescription>
                Download a template, fill it in Excel, then upload to import data into this company.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card
            className="cursor-pointer transition-shadow hover:shadow-md"
            onClick={() => setMode("export")}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowUpFromLine className="h-5 w-5" />
                Export
              </CardTitle>
              <CardDescription>
                Choose Master of Account or Vouchers and download as Excel.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      )}

      {mode !== null && (
        <>
          <Button variant="ghost" size="sm" onClick={() => setMode(null)} className="gap-1">
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>What to {mode === "import" ? "import" : "export"}</Label>
              <Select value={selectedEntityId} onValueChange={setSelectedEntityId}>
                <SelectTrigger className="w-full max-w-xs">
                  <SelectValue placeholder="Select type…" />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_CONFIGS.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {mode === "export" && (
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!selectedEntityId || isExporting}
                  onClick={handleExport}
                  className="gap-2"
                >
                  {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                  Export to Excel
                </Button>
              </div>
            )}

            {mode === "import" && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={!selectedEntityId}
                    onClick={handleDownloadTemplate}
                    className="gap-2"
                  >
                    <ArrowDownToLine className="h-4 w-4" />
                    Download template
                  </Button>
                </div>
                {supportsImport && (
                  <>
                    <div className="space-y-2">
                      <Label>Select Excel file</Label>
                      <input
                        type="file"
                        accept=".xlsx,.xls"
                        className="block w-full max-w-md text-sm"
                        onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                      />
                    </div>
                    <Button
                      disabled={!importFile || !selectedEntityId || isImporting}
                      onClick={handleImport}
                      className="gap-2"
                    >
                      {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpFromLine className="h-4 w-4" />}
                      Import
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}

      <AlertDialog
        open={fuzzyDialog?.open ?? false}
        onOpenChange={(open) => {
          if (!open && fuzzyDialog) fuzzyDialog.resolve("keep");
          setFuzzyDialog(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Similar account found</AlertDialogTitle>
          <AlertDialogDescription>
            This account has a slight difference from an existing one. Do you want to merge (update existing) or keep separate (create new)?
            <br />
            <br />
            <strong>Imported:</strong> {fuzzyDialog?.importedName}
            <br />
            <strong>Existing:</strong> {fuzzyDialog?.existingName}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                fuzzyDialog?.resolve("keep");
                setFuzzyDialog(null);
              }}
            >
              Keep separate
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                fuzzyDialog?.resolve("merge");
                setFuzzyDialog(null);
              }}
            >
              Merge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
