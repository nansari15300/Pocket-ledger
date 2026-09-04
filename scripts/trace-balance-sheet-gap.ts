/**
 * Account-by-account Balance Sheet gap trace from a .plbp / JSON backup.
 *
 * Usage:
 *   npx tsx scripts/trace-balance-sheet-gap.ts "D:\Backups\MyCompany.plbp"
 *   npx tsx scripts/trace-balance-sheet-gap.ts backup.plbp --password "company-password"
 *
 * Unencrypted zip/json backups work without --password.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { strFromU8 } from "fflate";
import { isPlbpZipPayload, unpackPlbpZipBackup } from "../src/lib/plbpBackupZip";
import { computeBalanceSheetAccountGapTrace } from "../src/lib/reports/balanceSheetAccountGapTrace";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  let password = "";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--password" && argv[i + 1]) {
      password = argv[++i];
    } else {
      positional.push(argv[i]);
    }
  }
  return { filePath: positional[0], password };
}

function alive<T extends { isDeleted?: boolean }>(rows: T[] | undefined): T[] {
  return (rows ?? []).filter((r) => !r.isDeleted);
}

const PLB2_MAGIC = Buffer.from([80, 76, 66, 50]);

function base64ToBytes(base64: string): Buffer {
  return Buffer.from(base64.trim().replace(/\s+/g, ""), "base64");
}

function deriveAesKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, 250_000, 32, "sha256");
}

function ivForChunk(baseIv: Buffer, chunkIndex: number): Buffer {
  const iv = Buffer.from(baseIv);
  iv.writeUInt32BE((iv.readUInt32BE(8) + chunkIndex) >>> 0, 8);
  return iv;
}

function decryptAesGcmChunk(key: Buffer, iv: Buffer, encrypted: Buffer): Buffer {
  const authTag = encrypted.subarray(encrypted.length - 16);
  const ciphertext = encrypted.subarray(0, encrypted.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Node CLI decrypt — same format as `src/lib/encryption.ts` (PBKDF2 + AES-GCM). */
function decryptBackupBytes(encryptedText: string, password: string): Uint8Array {
  const encryptedDataBuff = base64ToBytes(encryptedText);
  try {
    if (
      encryptedDataBuff.length > 36 &&
      encryptedDataBuff.subarray(0, 4).equals(PLB2_MAGIC)
    ) {
      let ptr = 4;
      const salt = encryptedDataBuff.subarray(ptr, ptr + 16);
      ptr += 16;
      const baseIv = encryptedDataBuff.subarray(ptr, ptr + 12);
      ptr += 12;
      const chunkCount = encryptedDataBuff.readUInt32BE(ptr);
      ptr += 4;
      const lengths: number[] = [];
      for (let i = 0; i < chunkCount; i++) {
        lengths.push(encryptedDataBuff.readUInt32BE(ptr));
        ptr += 4;
      }
      const key = deriveAesKey(password, salt);
      const plainChunks: Buffer[] = [];
      for (let i = 0; i < chunkCount; i++) {
        const len = lengths[i];
        const encChunk = encryptedDataBuff.subarray(ptr, ptr + len);
        ptr += len;
        plainChunks.push(decryptAesGcmChunk(key, ivForChunk(baseIv, i), encChunk));
      }
      return new Uint8Array(Buffer.concat(plainChunks));
    }

    const salt = encryptedDataBuff.subarray(0, 16);
    const iv = encryptedDataBuff.subarray(16, 28);
    const data = encryptedDataBuff.subarray(28);
    const key = deriveAesKey(password, salt);
    return new Uint8Array(decryptAesGcmChunk(key, iv, data));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ERR_OSSL_BAD_DECRYPT" || code === "ERR_OSSL_AUTH_TAG_VERIFY_FAILURE") {
      throw new Error("INVALID_PASSWORD");
    }
    throw err;
  }
}

async function loadBackupManifest(filePath: string, password: string): Promise<Record<string, unknown>> {
  const raw = fs.readFileSync(filePath);
  const head = raw.subarray(0, 1).toString();

  if (head === "{") {
    return JSON.parse(raw.toString("utf8")) as Record<string, unknown>;
  }

  if (isPlbpZipPayload(raw)) {
    const { manifest } = unpackPlbpZipBackup(raw);
    return manifest;
  }

  if (!password) {
    throw new Error("Backup is encrypted. Pass --password \"your-company-backup-password\"");
  }

  const plainBytes = decryptBackupBytes(raw.toString("utf8"), password);
  if (isPlbpZipPayload(plainBytes)) {
    return unpackPlbpZipBackup(plainBytes).manifest;
  }
  return JSON.parse(strFromU8(plainBytes)) as Record<string, unknown>;
}

function printSection(title: string) {
  console.log("\n" + "=".repeat(72));
  console.log(title);
  console.log("=".repeat(72));
}

function formatInr(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

async function main() {
  const { filePath, password } = parseArgs(process.argv.slice(2));
  if (!filePath) {
    console.error(
      'Usage: npx tsx scripts/trace-balance-sheet-gap.ts "<backup.plbp>" [--password "pwd"]'
    );
    process.exit(1);
  }

  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    console.error(`File not found: ${abs}`);
    process.exit(1);
  }

  const manifest = await loadBackupManifest(abs, password);
  const companyName = String(
    (manifest.companyDetails as Array<{ name?: string }> | undefined)?.[0]?.name ?? "Company"
  );

  const trace = computeBalanceSheetAccountGapTrace({
    processedAccounts: alive(manifest.bank_accounts as any[]),
    processedParties: alive(manifest.parties as any[]),
    processedStaff: alive(manifest.staff as any[]),
    processedTaxes: alive(manifest.taxes as any[]),
    processedExpenseAccounts: alive(manifest.expense_accounts as any[]),
    processedExpenseGroups: alive(manifest.expense_groups as any[]) as any[],
    processedGroups: alive(manifest.groups as any[]) as any[],
    processedAccountGroups: alive(manifest.account_groups as any[]) as any[],
    processedTaxGroups: alive(manifest.tax_groups as any[]) as any[],
    processedStaffGroups: alive(manifest.staff_groups as any[]) as any[],
    vouchers: alive(manifest.vouchers as any[]),
    processedTaxesForLedger: alive(manifest.taxes as any[]),
  });

  printSection(`Balance Sheet gap trace — ${companyName}`);
  console.log(`Total BS difference     : ${formatInr(trace.totals.difference)}`);
  console.log(`Opening audit (Dr−Cr)    : ${formatInr(trace.totals.openingAuditDiff)}`);
  console.log(
    `Remaining after opening  : ${formatInr(trace.totals.remainingAfterOpeningHeuristic)}  ← your ₹1,42,091 bucket`
  );
  console.log(`Net profit (P&L)         : ${formatInr(trace.totals.netProfit)}`);
  console.log(`Σ full gap − net profit  : ${formatInr(trace.totals.sumFullGap - trace.totals.netProfit)} (check)`);
  console.log(
    `Σ transaction gap        : ${formatInr(trace.totals.sumTransactionGap)} (non-opening layer)`
  );

  printSection("A) Opening mismatch masters (Dr − Cr audit) — NOT the ₹1,42,091 bucket");
  for (const m of trace.openingMismatchMasters) {
    console.log(
      `${m.side.padEnd(2)} ${formatInr(m.absAmount).padStart(16)}  ${m.accountName}`
    );
  }

  printSection(
    `B) Transaction-layer gap accounts (sorted) — mathematically explains remaining ₹${formatInr(trace.totals.remainingAfterOpeningHeuristic)}`
  );
  let running = 0;
  const target = Math.abs(trace.totals.remainingAfterOpeningHeuristic);
  for (const a of trace.transactionGapAccounts) {
    running = round2(running + a.transactionGapContribution);
    console.log(
      `${formatInr(a.transactionGapContribution).padStart(16)}  [${a.ledgerClass}/${a.group}]  ${a.accountName}`
    );
  }
  console.log(`\nΣ transaction gap listed: ${formatInr(running)}`);

  if (trace.uncategorized.length > 0) {
    printSection("C) Uncategorized (excluded from BS totals today)");
    for (const u of trace.uncategorized) {
      console.log(
        `${formatInr(u.signedBalance).padStart(16)}  ${u.accountName}  (${u.reason})`
      );
    }
  }

  printSection("D) Full per-account gap (opening + transaction = full)");
  for (const a of [...trace.accounts].sort(
    (x, y) => Math.abs(y.fullGapContribution) - Math.abs(x.fullGapContribution)
  )) {
    if (Math.abs(a.fullGapContribution) < 0.01) continue;
    console.log(
      `full=${formatInr(a.fullGapContribution).padStart(14)}  open=${formatInr(a.openingGapContribution).padStart(14)}  txn=${formatInr(a.transactionGapContribution).padStart(14)}  ${a.accountName}`
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
