/**
 * PlServer local company detection — runtime audit (NOT a production fix).
 * Usage: node scripts/run-plserver-company-detection-audit.mjs [--seed] [--user-data PATH] [--company-name "Local Exe"]
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const electronDir = path.join(root, "electron");
const electronBin = require(path.join(electronDir, "node_modules", "electron"));
const outIndex = path.join(root, "out", "index.html");

function parseArgs(argv) {
  const opts = {
    seed: false,
    userData: path.join(root, ".data", "plserver-company-detection-audit"),
    companyName: "Local Exe",
    companyId: "",
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--seed") opts.seed = true;
    else if (a === "--user-data" && argv[i + 1]) opts.userData = argv[++i];
    else if (a === "--company-name" && argv[i + 1]) opts.companyName = argv[++i];
    else if (a === "--company-id" && argv[i + 1]) opts.companyId = argv[++i];
  }
  return opts;
}

function parseReport(stdout) {
  const marker = "__PL_COMPANY_DETECTION_AUDIT_REPORT__";
  const idx = stdout.lastIndexOf(marker);
  if (idx < 0) return null;
  const json = stdout.slice(idx + marker.length).trim();
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function printTable(report) {
  if (!report || report.error) {
    console.error("Audit failed:", report?.error || "no report");
    return;
  }
  console.log("\n=== PlServer Company Detection Audit (RUNTIME) ===\n");
  console.log(`Company: ${report.companyName} (${report.companyId})`);
  console.log(`Selected in storage: ${report.selectedCompanyIdFromStorage || "(none)"}`);
  console.log(`hostShareable (PlServer Add Person): ${report.conclusion.hostShareable ? "YES ✅" : "NO ❌"}\n`);

  for (const row of report.rows || []) {
    console.log(`--- ${row.source} ---`);
    console.log(`  storageOption: ${row.storageOption}`);
    console.log(`  syncPolicy: ${row.syncPolicy}`);
    console.log(`  syncedFromCloud: ${row.syncedFromCloud}`);
    console.log(`  authoritativeCompanyId: ${row.authoritativeCompanyId || "(none)"}`);
    console.log(`  plServerShared: ${row.plServerShared}`);
    console.log(`  isServerGateCompany: ${row.isServerGateCompany}`);
    console.log(`  isLocalSelectorCompanyRow: ${row.isLocalSelectorCompanyRow}`);
    console.log(`  isPureLocalLedgerCompany: ${row.isPureLocalLedgerCompany}`);
    console.log(`  isCloudLinkedCompanyStorage: ${row.isCloudLinkedCompanyStorage}`);
    console.log(`  isLocalCompanyHostShareable: ${row.isLocalCompanyHostShareable}`);
    if (row.notes) console.log(`  notes: ${row.notes}`);
    console.log("");
  }

  if (report.divergences?.length) {
    console.log("Divergences:");
    for (const d of report.divergences) console.log(`  - ${d}`);
    console.log("");
  }

  console.log("Conclusion:");
  console.log(`  Wrong objects: ${(report.conclusion.wrongObjects || []).join(", ") || "(see divergences)"}`);
  console.log(`  Likely writer: ${report.conclusion.likelyWriter || "(unknown)"}`);
  console.log(`  Problem kind: ${(report.conclusion.problemKind || []).join(", ")}`);
  console.log("");
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!fs.existsSync(outIndex)) {
    console.error("Missing static build — run: npm run build:static:fast");
    process.exit(1);
  }
  fs.mkdirSync(opts.userData, { recursive: true });

  const qs = new URLSearchParams({
    pl_company_detection_audit: "1",
    pl_audit_company_name: opts.companyName,
  });
  if (opts.seed) qs.set("pl_audit_seed", "1");
  if (opts.companyId) qs.set("pl_audit_company_id", opts.companyId);

  console.log("PlServer company detection audit (runtime)");
  console.log(`  userData: ${opts.userData}`);
  console.log(`  seed plan-sync poison: ${opts.seed}`);
  console.log(`  company: ${opts.companyName}`);
  console.log("");

  await new Promise((resolve, reject) => {
    const child = spawn(electronBin, ["."], {
      cwd: electronDir,
      env: {
        ...process.env,
        PL_PLSERVER_COMPANY_AUDIT: "1",
        PL_PLSERVER_AUDIT_USER_DATA: opts.userData,
        PL_PLSERVER_AUDIT_QUERY: qs.toString(),
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => {
      stdout += String(c);
    });
    child.stderr.on("data", (c) => {
      stderr += String(c);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const report = parseReport(`${stdout}\n${stderr}`);
      printTable(report);
      if (!report) {
        console.error("No __PL_COMPANY_DETECTION_AUDIT_REPORT__ in output.");
        if (stderr) console.error(stderr.slice(-4000));
        process.exit(code || 1);
        return;
      }
      resolve(undefined);
    });
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
