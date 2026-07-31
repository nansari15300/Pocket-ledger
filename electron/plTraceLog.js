const fs = require("fs");
const path = require("path");

const MAX_MEMORY_ENTRIES = 500;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** @type {string | null} */
let logFilePath = null;
/** @type {Array<{ ts: string; tag: string; event: string; detail: string }>} */
const memory = [];

function shouldKeepTrace(tag, event) {
  if (process.env.PL_TRACE_VERBOSE === "1") return true;
  const t = String(tag || "");
  const e = String(event || "");
  if (t === "PL-VOUCHER-FORENSIC") return true;
  if (t === "PL-FIRESTORE") return true;
  if (/error|failed|failure|timeout|denied|reject|incomplete|abort|suspicious/i.test(e)) return true;
  if (
    t === "PL-MAIN" &&
    /app_ready|full_quit_requested|window_hidden_server_running|tray_created|tray_destroyed/i.test(e)
  ) {
    return true;
  }
  if (
    t === "PL-SERVER" &&
    /app_ui_listening|sharing_listening|bridge_warm_failed|shareable_companies_provider_done|shareable_companies_provider_failed/i.test(e)
  ) {
    return true;
  }
  if (
    t === "PL-SERVER-HTTP" &&
    /access_context_filter_audit|access_context_denied|attachment_access_/i.test(e)
  ) {
    return true;
  }
  return false;
}

function safeJson(value) {
  try {
    if (value == null) return "";
    if (typeof value === "string") return value;
    return JSON.stringify(value);
  } catch (_) {
    return String(value);
  }
}

function initPlTraceLog(userDataPath) {
  if (!userDataPath) return;
  try {
    fs.mkdirSync(userDataPath, { recursive: true });
    logFilePath = path.join(userDataPath, "pl-trace.log");
  } catch (_) {
    logFilePath = null;
  }
}

function rotateLogFileIfNeeded() {
  if (!logFilePath) return;
  try {
    const stat = fs.statSync(logFilePath);
    if (stat.size <= MAX_FILE_BYTES) return;
    const rotated = `${logFilePath}.1`;
    try {
      if (fs.existsSync(rotated)) fs.unlinkSync(rotated);
    } catch (_) {}
    fs.renameSync(logFilePath, rotated);
  } catch (_) {}
}

function traceLog(tag, event, detail) {
  if (!shouldKeepTrace(tag, event)) return;
  const entry = {
    ts: new Date().toISOString(),
    tag: String(tag || "PL-TRACE"),
    event: String(event || ""),
    detail: safeJson(detail),
  };
  memory.push(entry);
  if (memory.length > MAX_MEMORY_ENTRIES) {
    memory.splice(0, memory.length - MAX_MEMORY_ENTRIES);
  }
  const line = `[${entry.ts}] [${entry.tag}] ${entry.event}${entry.detail ? ` ${entry.detail}` : ""}\n`;
  console.log(`[${entry.tag}]`, entry.event, detail ?? "");
  if (!logFilePath) return;
  try {
    rotateLogFileIfNeeded();
    fs.appendFileSync(logFilePath, line, "utf8");
  } catch (_) {}
}

function getRecentTraceLogs(limit = 200) {
  const n = Math.max(1, Math.min(Number(limit) || 200, MAX_MEMORY_ENTRIES));
  return memory.slice(-n);
}

function getTraceLogFilePath() {
  return logFilePath;
}

module.exports = {
  initPlTraceLog,
  traceLog,
  getRecentTraceLogs,
  getTraceLogFilePath,
};
