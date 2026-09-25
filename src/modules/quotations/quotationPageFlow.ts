import { stripHtml } from "./html";

const OVERFLOW_PX = 2;
const MAX_MOVES = 80;

export function pageContentBottom(page: HTMLElement): number {
  const box = page.getBoundingClientRect();
  const pad = parseFloat(window.getComputedStyle(page).paddingBottom || "0") || 0;
  return box.bottom - pad;
}

function skipEmptyText(node: ChildNode | null): boolean {
  return !!node && node.nodeType === Node.TEXT_NODE && !String(node.textContent || "").trim();
}

export function lastContentNode(parent: HTMLElement): ChildNode | null {
  for (let i = parent.childNodes.length - 1; i >= 0; i--) {
    const node = parent.childNodes[i];
    if (skipEmptyText(node)) continue;
    return node;
  }
  return null;
}

export function firstContentNode(parent: HTMLElement): ChildNode | null {
  for (let i = 0; i < parent.childNodes.length; i++) {
    const node = parent.childNodes[i];
    if (skipEmptyText(node)) continue;
    return node;
  }
  return null;
}

export function contentNodeCount(parent: HTMLElement): number {
  let n = 0;
  for (let i = 0; i < parent.childNodes.length; i++) {
    if (!skipEmptyText(parent.childNodes[i])) n += 1;
  }
  return n;
}

/** True when letter TEXT crosses the A4 edge — empty min-height space is not overflow. */
export function bodyOverflowsPage(page: HTMLElement | null, body?: HTMLElement | null): boolean {
  if (!page || !body) return false;
  if (body.classList.contains("is-placeholder")) return false;
  const limit = pageContentBottom(page) - 2;
  const last = lastContentNode(body);
  if (!last) return false;
  const el = last instanceof HTMLElement ? last : last.parentElement;
  if (el && el.getBoundingClientRect().bottom > limit + OVERFLOW_PX) return true;
  return false;
}

export function nodeExceedsPage(page: HTMLElement, node: ChildNode | null): boolean {
  if (!node || !(node instanceof HTMLElement)) return false;
  return node.getBoundingClientRect().bottom > pageContentBottom(page) - 2 + OVERFLOW_PX;
}

function isBlockElement(node: ChildNode | null): node is HTMLElement {
  if (!node || !(node instanceof HTMLElement)) return false;
  return /^(P|DIV|LI|H1|H2|H3|H4|H5|H6|BLOCKQUOTE|UL|OL|TABLE|PRE)$/.test(node.tagName);
}

function splitInnerHtmlByBr(html: string): string[] {
  return html.split(/<br\s*\/?>/i);
}

/** Turn Enter/`<br>` soup into block paragraphs so overflow can move line by line. */
export function normalizeEnterBlocks(body: HTMLElement | null) {
  if (!body) return;
  const direct = Array.from(body.childNodes);
  const hasDirectBr = direct.some((n) => n.nodeName === "BR");
  const elementChildren = Array.from(body.children);
  if (hasDirectBr) {
    const parts = splitInnerHtmlByBr(body.innerHTML);
    if (parts.length > 1) {
      body.innerHTML = parts.map((part) => `<p>${part.trim() ? part : "<br>"}</p>`).join("");
    }
    return;
  }
  if (elementChildren.length === 1 && elementChildren[0].querySelector("br")) {
    const wrap = elementChildren[0] as HTMLElement;
    if (isBlockElement(wrap) && !wrap.querySelector("img, table, ul, ol")) {
      const parts = splitInnerHtmlByBr(wrap.innerHTML);
      if (parts.length > 1) {
        body.innerHTML = parts.map((part) => `<p>${part.trim() ? part : "<br>"}</p>`).join("");
      }
    }
  }
}

function placeCaretIn(node: ChildNode, atEnd: boolean) {
  const editable =
    node instanceof HTMLElement
      ? node.closest("[contenteditable='true']") || (node.isContentEditable ? node : null)
      : node.parentElement?.closest("[contenteditable='true']");
  if (!(editable instanceof HTMLElement)) return;
  editable.focus();
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  if (node instanceof HTMLElement) {
    range.selectNodeContents(node);
    range.collapse(!atEnd);
  } else {
    range.selectNodeContents(editable);
    range.collapse(!atEnd);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

function selectionInside(node: ChildNode | null): boolean {
  if (!node) return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const anchor = sel.anchorNode;
  if (!anchor) return false;
  return node === anchor || node.contains(anchor);
}

export function pushOverflowForward(pages: HTMLElement[], bodies: HTMLElement[]): "need-page" | "done" {
  for (let i = 0; i < pages.length; i++) {
    let moves = 0;
    while (bodyOverflowsPage(pages[i], bodies[i]) && moves++ < MAX_MOVES) {
      if (moves === 1) normalizeEnterBlocks(bodies[i]);
      const node = lastContentNode(bodies[i]);
      if (!node) break;
      if (i === pages.length - 1) {
        const unsplittable =
          contentNodeCount(bodies[i]) === 1 &&
          node instanceof HTMLElement &&
          node.offsetHeight >= Math.max(48, pages[i].clientHeight - 48);
        if (unsplittable) break;
        return "need-page";
      }
      if (!bodies[i + 1]) break;
      const follow = selectionInside(node);
      bodies[i + 1].classList.remove("is-placeholder");
      bodies[i + 1].insertBefore(node, bodies[i + 1].firstChild);
      if (follow) placeCaretIn(node, true);
    }
  }
  return "done";
}

export function pageOverflows(page: HTMLElement | null, body?: HTMLElement | null): boolean {
  if (!page) return false;
  if (page.scrollHeight > page.clientHeight + OVERFLOW_PX) return true;
  if (bodyOverflowsPage(page, body)) return true;
  const limit = pageContentBottom(page);
  const items = page.querySelector(".quotation-letter-items") as HTMLElement | null;
  if (items && items.getBoundingClientRect().bottom > limit + OVERFLOW_PX) return true;
  return false;
}

const TABLE_TITLE_H = 22;
const TABLE_HEAD_H = 30;
const TABLE_ROW_H = 36;
const TABLE_FOOTER_H = 68;
const TABLE_GAP_H = 10;
const FIT_SLACK = 2;

export function extraBodyIsEmpty(el: HTMLElement | null): boolean {
  return !el || !stripHtml(el.innerHTML);
}

export function extraBodyIsEmptyHtml(html: string | null | undefined): boolean {
  return !stripHtml(html || "");
}

/** Hide extra typing box only when it is the blank sheet stub — not continued Enter lines. */
export function extraBodyIsPlaceholderHtml(html: string | null | undefined): boolean {
  const raw = String(html || "");
  if (stripHtml(raw)) return false;
  if (/<img\b/i.test(raw)) return false;
  const blocks = raw.match(/<(p|div|li|h[1-6]|blockquote|ul|ol|table)\b/gi) || [];
  const brs = raw.match(/<br\b/gi) || [];
  return blocks.length <= 1 && brs.length <= 1;
}

export function bodyHasLayoutContent(el: HTMLElement | null): boolean {
  if (!el) return false;
  if (el.querySelector("img, table, ul, ol, blockquote, hr")) return true;
  if (stripHtml(el.innerHTML)) return true;
  if (el.children.length > 1) return true;
  return contentNodeCount(el) > 1;
}

function isBodyHidden(body: HTMLElement | null): boolean {
  if (!body) return true;
  if (body.classList.contains("is-placeholder")) return true;
  return window.getComputedStyle(body).display === "none";
}

function tableStartY(page: HTMLElement, body: HTMLElement | null): number {
  const slot = page.querySelector(".quotation-letter-pictures-slot") as HTMLElement | null;
  if (slot) return slot.getBoundingClientRect().bottom;
  if (body && !isBodyHidden(body)) return body.getBoundingClientRect().bottom;
  const padTop = parseFloat(window.getComputedStyle(page).paddingTop || "0") || 0;
  return page.getBoundingClientRect().top + padTop;
}

function measuredRowHeight(itemsRoot: HTMLElement | null): number {
  const row = itemsRoot?.querySelector<HTMLElement>("tbody tr");
  const h = row?.getBoundingClientRect().height || 0;
  if (h >= 24 && h <= 72) return h;
  return TABLE_ROW_H;
}

function itemsFooterChrome(itemsRoot: HTMLElement | null): number {
  if (!itemsRoot) return TABLE_FOOTER_H;
  const tfoot = itemsRoot.querySelector("tfoot") as HTMLElement | null;
  const add = itemsRoot.querySelector(".quotation-letter-items-add") as HTMLElement | null;
  let h = 0;
  if (tfoot) h += tfoot.getBoundingClientRect().height;
  if (add) h += add.getBoundingClientRect().height;
  return h > 0 ? h : TABLE_FOOTER_H;
}

function itemsBlockBottom(itemsRoot: HTMLElement): number {
  return itemsRoot.getBoundingClientRect().bottom;
}

/** Whole table rows whose bottom is inside the page content box — never a half row. */
export function countWholeRowsFitting(page: HTMLElement | null, itemsRoot: HTMLElement | null): number {
  if (!page || !itemsRoot) return 0;
  const limit = pageContentBottom(page) - FIT_SLACK;
  const itemsBox = itemsRoot.getBoundingClientRect();
  if (itemsBox.top > limit - 8) return 0;
  const rows = Array.from(itemsRoot.querySelectorAll<HTMLElement>("tbody tr"));
  if (rows.length === 0) return 0;
  let fit = 0;
  for (const row of rows) {
    const box = row.getBoundingClientRect();
    if (box.bottom <= limit + 0.5) fit += 1;
    else break;
  }
  return fit;
}

/** If Total / Add item / any row sits in the bottom margin, drop whole rows until the block fits. */
function keepFromRenderedItems(
  page: HTMLElement,
  itemsRoot: HTMLElement,
  remaining: number
): number | null {
  const limit = pageContentBottom(page) - FIT_SLACK;
  const rows = Array.from(itemsRoot.querySelectorAll<HTMLElement>("tbody tr"));
  if (rows.length === 0) return null;
  if (itemsRoot.getBoundingClientRect().top > limit - 8) return 0;

  let fit = 0;
  for (const row of rows) {
    if (row.getBoundingClientRect().bottom <= limit + 0.5) fit += 1;
    else break;
  }

  const overflow = itemsBlockBottom(itemsRoot) > limit + 0.5;
  if (!overflow && fit >= rows.length) return null;

  if (overflow && fit >= rows.length) {
    // Data rows fit; Total / Add item do not — send last row(s) down with them.
    fit = Math.max(0, rows.length - 1);
  }
  return Math.min(remaining, fit);
}

/** How many whole item rows fit in leftover space below the letter body. */
export function rowsFittingBelowBody(
  page: HTMLElement | null,
  body: HTMLElement | null,
  remaining: number
): number {
  if (!page || remaining <= 0) return 0;
  const limit = pageContentBottom(page) - FIT_SLACK;
  const start = tableStartY(page, body);
  if (start > limit - 8) return 0;

  const itemsRoot = page.querySelector(".quotation-letter-items") as HTMLElement | null;
  const rows = itemsRoot ? Array.from(itemsRoot.querySelectorAll<HTMLElement>("tbody tr")) : [];
  const rowH = measuredRowHeight(itemsRoot);
  const footerH = itemsFooterChrome(itemsRoot);

  if (itemsRoot && rows.length > 0) {
    const fromDom = keepFromRenderedItems(page, itemsRoot, remaining);
    if (fromDom != null) return fromDom;
  }

  const hasLetterhead = !!page.querySelector(".quotation-letter-head");
  const chrome = TABLE_GAP_H + (hasLetterhead ? TABLE_TITLE_H : 0) + TABLE_HEAD_H;
  const space = limit - start - chrome;
  if (space < rowH * 0.8) return 0;

  const withoutFooter = Math.max(0, Math.floor(space / rowH));
  const withFooter = Math.max(0, Math.floor((space - footerH) / rowH));
  let keep = 0;
  if (withoutFooter >= remaining) {
    keep = withFooter >= remaining ? remaining : Math.max(0, Math.min(remaining - 1, withFooter));
  } else {
    keep = Math.min(remaining, withoutFooter);
  }

  if (rows.length > 0 && itemsRoot) {
    const leftover = limit - itemsBlockBottom(itemsRoot);
    if (leftover >= rowH) {
      const more = Math.floor((leftover - 4) / rowH);
      let next = Math.min(remaining, rows.length + more);
      if (next >= remaining) {
        const extraRows = remaining - rows.length;
        if (leftover < extraRows * rowH + (itemsRoot.querySelector("tfoot") ? 0 : footerH)) {
          next = Math.min(remaining - 1, rows.length + Math.max(0, Math.floor((leftover - footerH) / rowH)));
        }
      }
      keep = Math.max(keep, next);
    }
  }

  return Math.max(0, Math.min(remaining, keep));
}

export function normalizeRowSplits(splits: number[], total: number): number[] {
  const out: number[] = [];
  let used = 0;
  for (const n of splits) {
    if (used >= total) break;
    const keep = Math.max(0, Math.min(Math.floor(n) || 0, total - used));
    out.push(keep);
    used += keep;
  }
  if (used < total) out.push(total - used);
  while (out.length > 1 && out[out.length - 1] === 0) out.pop();
  if (out.length === 0) out.push(Math.max(1, total));
  return out;
}

export function sameRowSplits(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((n, i) => n === b[i]);
}

export function pullUnderflowBack(pages: HTMLElement[], bodies: HTMLElement[]) {
  for (let i = 0; i < pages.length - 1; i++) {
    let moves = 0;
    while (!bodyOverflowsPage(pages[i], bodies[i]) && moves++ < MAX_MOVES) {
      if (extraBodyIsEmpty(bodies[i + 1]) && contentNodeCount(bodies[i + 1]) <= 1) break;
      const node = firstContentNode(bodies[i + 1]);
      if (!node) break;
      bodies[i].appendChild(node);
      const tooMuch = bodyOverflowsPage(pages[i], bodies[i]) || nodeExceedsPage(pages[i], node);
      if (tooMuch) {
        bodies[i + 1].insertBefore(node, bodies[i + 1].firstChild);
        break;
      }
    }
  }
}
