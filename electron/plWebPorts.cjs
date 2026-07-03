/** Shared port ranges — dev Next vs packaged EXE static server (see main.js getAppEntryUrl). */
const DEV_WEB_PORT_START = 4500;
const DEV_WEB_PORT_COUNT = 100;

const EXE_APP_UI_PORT_START = 3000;
const EXE_APP_UI_PORT_COUNT = 100;

/** Preferred ports first (in order), then consecutive range [start, start + count). */
function consecutivePortCandidates(start, count, ...preferredValues) {
  const ordered = [];
  const seen = new Set();
  const add = (port) => {
    const n = Number(port);
    if (!Number.isFinite(n) || n <= 0 || n >= 65536) return;
    if (seen.has(n)) return;
    seen.add(n);
    ordered.push(n);
  };
  for (const p of preferredValues) {
    if (p != null) add(p);
  }
  const base = Number(start);
  const len = Number(count);
  if (Number.isFinite(base) && Number.isFinite(len) && len > 0) {
    for (let i = 0; i < len; i++) add(base + i);
  }
  return ordered;
}

module.exports = {
  DEV_WEB_PORT_START,
  DEV_WEB_PORT_COUNT,
  EXE_APP_UI_PORT_START,
  EXE_APP_UI_PORT_COUNT,
  consecutivePortCandidates,
};
