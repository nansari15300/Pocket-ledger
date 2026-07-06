/**
 * Phase 1B runtime verification runner (Host + simulated LAN client).
 * Usage: node scripts/run-phase1b-runtime-verify.mjs
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
const userData = path.join(root, ".data", "phase1b-runtime-verify");
const outIndex = path.join(root, "out", "index.html");

function parseReport(stdout) {
  const marker = "__PL_PHASE1B_VERIFY_REPORT__";
  const idx = stdout.indexOf(marker);
  if (idx < 0) return null;
  const json = stdout.slice(idx + marker.length).trim();
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function runElectron(phase) {
  return new Promise((resolve, reject) => {
    const child = spawn(electronBin, ["."], {
      cwd: electronDir,
      env: {
        ...process.env,
        PL_PHASE1B_RUNTIME_VERIFY: "1",
        PL_PHASE1B_VERIFY_USER_DATA: userData,
        PL_PHASE1B_VERIFY_PHASE: phase,
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
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function printReport(report) {
  if (!report) {
    console.error("No verification report found in stdout.");
    return;
  }
  console.log("\n=== Phase 1B Runtime Verification ===\n");
  for (const scenario of report.scenarios || []) {
    const status = scenario.pass ? "PASS" : "FAIL";
    console.log(`${status}  ${scenario.name}`);
    for (const check of scenario.checks || []) {
      const mark = check.pass ? "  ✓" : "  ✗";
      console.log(`${mark} ${check.label}${check.pass ? "" : ` (actual: ${JSON.stringify(check.actual)})`}`);
    }
    if (scenario.failed?.length) {
      for (const f of scenario.failed) {
        console.log(`  ✗ ${f.label} (actual: ${JSON.stringify(f.actual)})`);
      }
    }
    console.log("");
  }
  console.log(report.allPassed ? "Overall: PASS — Phase 1B production-complete.\n" : "Overall: FAIL\n");
}

async function main() {
  if (!fs.existsSync(outIndex)) {
    console.error("Missing static build. Run: npm run build:static:fast");
    process.exit(1);
  }

  fs.mkdirSync(userData, { recursive: true });
  try {
    fs.rmSync(userData, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  fs.mkdirSync(userData, { recursive: true });

  console.log("Phase 1B runtime verify — phase A (scenarios 1–4 + restart seed)…");
  const phaseA = await runElectron("all");
  const reportA = parseReport(phaseA.stdout);
  if (phaseA.stderr.trim()) {
    console.error(phaseA.stderr.trim());
  }
  printReport(reportA);

  if (!reportA?.scenarios?.every((s) => s.pass)) {
    process.exit(phaseA.code || 1);
  }

  console.log("Phase 1B runtime verify — phase B (restart persistence)…");
  const phaseB = await runElectron("restart-b");
  const reportB = parseReport(phaseB.stdout);
  if (phaseB.stderr.trim()) {
    console.error(phaseB.stderr.trim());
  }
  printReport(reportB);

  const ok = reportB?.allPassed === true && phaseB.code === 0;
  process.exit(ok ? 0 : phaseB.code || 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
