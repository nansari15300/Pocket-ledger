/**
 * OCR must read the ORIGINAL full-resolution file, not the compressed attachment.
 * The frozen compression helpers (appendCompressedVoucherAttachments.ts) are NOT modified: forms import them
 * through ocrWrapAppend / ocrWrapInputChange, which stash the raw incoming File(s) and wrap the setFiles callback
 * so every compressed File object that lands in state is mapped (by object identity, not by name) to its original.
 */
const byCompressed = new WeakMap<object, File>();
let last: { files: File[]; at: number } = { files: [], at: 0 };
const isFile = (f: unknown): f is File => typeof File !== "undefined" && f instanceof File;

export function rememberOcrOriginals(files: readonly unknown[] | null | undefined) {
  const fs = (files ?? []).filter(isFile);
  if (fs.length) last = { files: fs, at: Date.now() };
}

/** Original for a stored attachment: exact object mapping first, then (same upload, one file) the last raw pick. */
export function takeOcrOriginal(stored: File | string | undefined): File | null {
  if (!stored) return null;
  if (typeof stored !== "string") {
    const hit = byCompressed.get(stored);
    if (hit) return hit;
    if (last.files.includes(stored)) return stored; // not compressed (e.g. PDF) = already original
  }
  return last.files.length === 1 && Date.now() - last.at < 10 * 60_000 ? last.files[0] : null;
}

/** Remember an original for a known attachment object (hand-off between forms). */
export function linkOcrOriginal(stored: File | string | undefined, original: File | null | undefined) {
  if (stored && typeof stored !== "string" && original) byCompressed.set(stored, original);
}

type SetFiles = (next: unknown) => void;
function wrapSetFiles(setFiles: SetFiles, currentFiles: readonly unknown[] | undefined, originals: File[]): SetFiles {
  return (next: unknown) => {
    try {
      const arr = typeof next === "function" ? null : (next as unknown[]);
      if (Array.isArray(arr)) {
        const before = new Set(currentFiles ?? []);
        const added = arr.filter((f) => isFile(f) && !before.has(f)) as File[];
        const base = (n: string) => n.replace(/\.[^.]+$/, "").toLowerCase();
        added.forEach((c, i) => {
          const o = originals.length === added.length ? originals[i] : originals.find((x) => base(x.name) === base(c.name)) ?? (originals.length === 1 ? originals[0] : undefined);
          if (o) byCompressed.set(c, o);
        });
      }
    } catch {
      /* never block the upload */
    }
    setFiles(next);
  };
}

/* ---------- OCR-then-compress gate ----------
 * When OCR is enabled the visible voucher form registers a pre-OCR reader. The wrapped (frozen) compression helpers
 * are then called only AFTER OCR on the original resolves (success or failure). OCR disabled -> nothing registered,
 * helpers run immediately exactly as before. */
type PreOcr = (file: File) => Promise<void>;
let preOcr: PreOcr | null = null;
export function registerPreOcr(fn: PreOcr): () => void {
  preOcr = fn;
  return () => {
    if (preOcr === fn) preOcr = null;
  };
}
const ocrable = (f: File) => /^image\//.test(f.type) || f.type === "application/pdf" || /\.(jpe?g|png|webp|bmp|pdf)$/i.test(f.name);
/** Resolves once OCR on the first original finished (never rejects; times out so uploads are never stuck). */
function gate(originals: File[], currentFiles: readonly unknown[] | undefined): Promise<void> | null {
  const fn = preOcr;
  if (!fn || (currentFiles?.length ?? 0) > 0 || !originals.length || !ocrable(originals[0])) return null;
  return Promise.race([fn(originals[0]).catch(() => undefined), new Promise<void>((r) => setTimeout(r, 120_000))]);
}
function fileListLike(files: File[]): FileList {
  const o: Record<string | number, unknown> = { length: files.length, item: (i: number) => files[i] ?? null, [Symbol.iterator]: function* () { yield* files; } };
  files.forEach((f, i) => (o[i] = f));
  return o as unknown as FileList;
}

type AttachArgs = { incomingFiles?: unknown; currentFiles?: readonly unknown[]; setFiles: SetFiles };

/** appendCompressedVoucherAttachmentsToState (frozen) with original capture; same signature. */
export function ocrWrapAppend<F extends (args: any, ...rest: any[]) => any>(fn: F): F {
  return ((args: AttachArgs, ...rest: unknown[]) => {
    const inc = args?.incomingFiles as unknown;
    const originals = (Array.isArray(inc) ? inc : inc && typeof (inc as FileList).length === "number" ? Array.from(inc as FileList) : []).filter(isFile);
    rememberOcrOriginals(originals);
    const go = () => fn({ ...args, setFiles: wrapSetFiles(args.setFiles, args.currentFiles, originals) }, ...rest);
    const g = gate(originals, args?.currentFiles);
    return g ? g.then(go) : go();
  }) as F;
}

/** handleVoucherAttachmentInputChange (frozen) with original capture; same signature. */
export function ocrWrapInputChange<F extends (e: any, args: any, ...rest: any[]) => any>(fn: F): F {
  return ((e: { target?: { files?: FileList | null } }, args: AttachArgs, ...rest: unknown[]) => {
    const originals = Array.from(e?.target?.files ?? []).filter(isFile);
    rememberOcrOriginals(originals);
    const g = gate(originals, args?.currentFiles);
    if (!g) return fn(e, { ...args, setFiles: wrapSetFiles(args.setFiles, args.currentFiles, originals) }, ...rest);
    // The input element is reset by the browser/handler; keep the picked files and replay with a stable event
    const files = fileListLike(originals);
    const target = e?.target as { value?: string } | undefined;
    const ev = { ...(e as object), target: { ...(target ?? {}), files, value: "" }, currentTarget: { files, value: "" }, persist: () => undefined, preventDefault: () => undefined, stopPropagation: () => undefined };
    try { if (target) target.value = ""; } catch { /* readonly */ }
    return g.then(() => fn(ev, { ...args, setFiles: wrapSetFiles(args.setFiles, args.currentFiles, originals) }, ...rest));
  }) as F;
}

/** Capture-phase listeners (backup for pickers that do not go through the wrapped helpers). */
export function installOcrOriginalCapture(): () => void {
  if (typeof document === "undefined") return () => undefined;
  const onChange = (e: Event) => {
    const t = e.target as HTMLInputElement | null;
    if (t && t.tagName === "INPUT" && t.type === "file" && t.files?.length) rememberOcrOriginals(Array.from(t.files));
  };
  const onDrop = (e: DragEvent) => {
    if (e.dataTransfer?.files?.length) rememberOcrOriginals(Array.from(e.dataTransfer.files));
  };
  const onPaste = (e: ClipboardEvent) => {
    if (e.clipboardData?.files?.length) rememberOcrOriginals(Array.from(e.clipboardData.files));
  };
  document.addEventListener("change", onChange, true);
  document.addEventListener("drop", onDrop, true);
  document.addEventListener("paste", onPaste, true);
  return () => {
    document.removeEventListener("change", onChange, true);
    document.removeEventListener("drop", onDrop, true);
    document.removeEventListener("paste", onPaste, true);
  };
}
