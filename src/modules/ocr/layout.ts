/** Tesseract result -> lines with word boxes (shared by the browser engine and the node fixture test). */
import type { OcrRawLine, OcrWord } from "./types";

export function linesFromTesseractData(data: any): OcrRawLine[] {
  const out: OcrRawLine[] = [];
  for (const b of data?.blocks ?? []) {
    for (const p of b?.paragraphs ?? []) {
      for (const l of p?.lines ?? []) {
        const words: OcrWord[] = (l.words ?? [])
          .map((w: any) => ({
            text: String(w.text ?? "").trim(),
            x0: Number(w.bbox?.x0 ?? 0),
            x1: Number(w.bbox?.x1 ?? 0),
            y0: Number(w.bbox?.y0 ?? 0),
            y1: Number(w.bbox?.y1 ?? 0),
            conf: Number(w.confidence ?? 0),
          }))
          .filter((w: OcrWord) => w.text);
        const text = words.length ? words.map((w) => w.text).join(" ") : String(l.text ?? "").trim();
        if (text) out.push({ text, confidence: Number(l.confidence ?? 0), y: Number(l.bbox?.y0 ?? 0), words });
      }
    }
  }
  if (!out.length) {
    String(data?.text ?? "")
      .split(/\r?\n/)
      .forEach((t, i) => t.trim() && out.push({ text: t.trim(), confidence: Number(data?.confidence ?? 0), y: i * 20 }));
  }
  return out.sort((a, b) => a.y - b.y);
}
