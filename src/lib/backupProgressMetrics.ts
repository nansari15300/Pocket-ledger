/** Attachment backup progress — Mbps + remaining time helpers. */

/** Bytes processed → megabits per second (Mbps). */
export function bytesPerSecToMbps(bytesTotal: number, elapsedMs: number): number {
  const sec = Math.max(0.001, elapsedMs / 1000);
  return (Math.max(0, bytesTotal) * 8) / (sec * 1_000_000);
}

/** Chhote speeds ko Kbps/files-sec me — 0.0 Mbps rounding avoid. */
export function formatBackupThroughputLabel(opts: {
  bytesTotal: number;
  elapsedMs: number;
  filesDone?: number;
  /** Last file/window ka instant rate — average se zyada responsive. */
  instantMbps?: number;
}): string | undefined {
  const { bytesTotal, elapsedMs, filesDone = 0 } = opts;
  const mbps =
    typeof opts.instantMbps === "number" && Number.isFinite(opts.instantMbps) && opts.instantMbps > 0
      ? opts.instantMbps
      : bytesPerSecToMbps(bytesTotal, elapsedMs);

  if (bytesTotal > 0 && mbps > 0) {
    if (mbps >= 0.1) return `${mbps.toFixed(1)} Mbps`;
    if (mbps >= 0.001) return `${(mbps * 1000).toFixed(1)} Kbps`;
    return `${(mbps * 1_000_000).toFixed(0)} bps`;
  }

  // URL skip / chhote files — byte 0 ho to file pace dikhao (0.0 Mbps mat).
  if (filesDone > 0 && elapsedMs >= 400) {
    const sec = elapsedMs / 1000;
    const fps = filesDone / sec;
    if (fps >= 1) return `${fps.toFixed(1)} files/sec`;
    const fpm = fps * 60;
    if (fpm >= 0.05) return `${fpm.toFixed(1)} files/min`;
  }

  return undefined;
}

/** Human label for ETA seconds — "~2 min left", "~45 sec left". */
export function formatBackupRemainingTime(remainingSec: number): string {
  const s = Math.max(0, Math.round(remainingSec));
  if (s <= 0) return "~0 sec left";
  if (s < 60) return `~${s} sec left`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return r > 0 ? `~${m} min ${r} sec left` : `~${m} min left`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `~${h} hr ${rm} min left` : `~${h} hr left`;
}

/** Files done/total se average pace par remaining ETA. */
export function estimateRemainingFromFilePace(
  done: number,
  total: number,
  elapsedMs: number
): string | undefined {
  if (done <= 0 || total <= done) return undefined;
  const secPerFile = elapsedMs / 1000 / done;
  return formatBackupRemainingTime(secPerFile * (total - done));
}
