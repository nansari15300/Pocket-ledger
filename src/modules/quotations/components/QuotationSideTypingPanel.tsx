"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { chromeProPillCn } from "@/lib/chromePillButton";
import {
  ADD_NEW_TYPING_ADDRESS_ID,
  addCustomTypingLink,
  listQuotationTypingLinksForUi,
  openQuotationOnlineTypingLink,
  quotationTypingLinkAllowsIframe,
  resolveQuotationTypingLink,
} from "../quotationOnlineTypingLinks";

const sitePillCn = cn(chromeProPillCn, "h-8 w-full rounded-full px-3 text-xs text-blue-900 shadow-none");
const WIDTH_STORAGE_KEY = "pl-quotation-side-typing-width";
const DEFAULT_PANEL_WIDTH = 520;
const MIN_PANEL_WIDTH = 300;
const IFRAME_MIN_WIDTH = 980;

function readStoredWidth(): number {
  if (typeof window === "undefined") return DEFAULT_PANEL_WIDTH;
  const n = Number(window.sessionStorage.getItem(WIDTH_STORAGE_KEY));
  return Number.isFinite(n) && n >= MIN_PANEL_WIDTH ? n : DEFAULT_PANEL_WIDTH;
}

function clampPanelWidth(px: number): number {
  const max = typeof window !== "undefined" ? Math.round(window.innerWidth * 0.88) : 1200;
  return Math.max(MIN_PANEL_WIDTH, Math.min(max, Math.round(px)));
}

export function QuotationSideTypingPanel({
  linkId,
  onLinkIdChange,
  onClose,
}: {
  linkId: string;
  onLinkIdChange: (id: string) => void;
  onClose: () => void;
}) {
  const asideRef = useRef<HTMLElement | null>(null);
  const [panelWidth, setPanelWidth] = useState(readStoredWidth);
  const resizingRef = useRef(false);
  const [linkOptions, setLinkOptions] = useState(listQuotationTypingLinksForUi);
  const [addAddressOpen, setAddAddressOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");

  const link = resolveQuotationTypingLink(linkId);
  const iframeAllowed = quotationTypingLinkAllowsIframe(link);

  useEffect(() => {
    setLinkOptions(listQuotationTypingLinksForUi());
  }, [linkId, addAddressOpen]);

  const openExternal = () => openQuotationOnlineTypingLink(link);

  const onResizePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    resizingRef.current = true;
    const startX = e.clientX;
    const startWidth = panelWidth;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      if (!resizingRef.current) return;
      const delta = startX - ev.clientX;
      setPanelWidth(clampPanelWidth(startWidth + delta));
    };
    const onUp = (ev: PointerEvent) => {
      resizingRef.current = false;
      target.releasePointerCapture(ev.pointerId);
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
  }, [panelWidth]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(WIDTH_STORAGE_KEY, String(panelWidth));
    } catch {
      /* ignore */
    }
  }, [panelWidth]);

  useEffect(() => {
    const onResize = () => setPanelWidth((w) => clampPanelWidth(w));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const iframeWidth = Math.max(panelWidth - 8, IFRAME_MIN_WIDTH);

  return (
    <aside
      ref={asideRef}
      className="quotation-side-typing-panel quotation-letter-ui-only relative flex min-h-0 shrink-0 flex-col border-l border-blue-200 bg-white"
      style={{ width: panelWidth, maxWidth: "88vw" }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize typing panel"
        title="Drag to resize width"
        className="quotation-side-typing-resize-handle"
        onPointerDown={onResizePointerDown}
      />
      <div className="flex flex-shrink-0 flex-col gap-2 border-b border-blue-100 bg-blue-50/80 px-2 py-2">
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <Select
              value={linkId}
              onValueChange={(v) => {
                if (v === ADD_NEW_TYPING_ADDRESS_ID) {
                  setAddAddressOpen(true);
                  return;
                }
                onLinkIdChange(v);
              }}
            >
              <SelectTrigger className={sitePillCn}>
                <SelectValue placeholder="Typing site" />
              </SelectTrigger>
              <SelectContent>
                {linkOptions.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.label}
                  </SelectItem>
                ))}
                <SelectSeparator />
                <SelectItem value={ADD_NEW_TYPING_ADDRESS_ID}>Add new address</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="button" variant="chromePill" size="icon" className="h-8 w-8 shrink-0" title="Close panel" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="chromePill"
            size="sm"
            className="h-8 shrink-0 whitespace-nowrap px-2 text-xs"
            onClick={openExternal}
          >
            <ExternalLink className="mr-1 h-3.5 w-3.5" />
            Open in browser
          </Button>
        </div>
      </div>
      <div className="quotation-side-typing-frame-wrap min-h-0 flex-1">
        {iframeAllowed ? (
          <iframe
            key={link.href}
            title={link.label}
            src={link.href}
            className="quotation-side-typing-frame border-0 bg-white"
            style={{
              width: iframeWidth,
              minWidth: IFRAME_MIN_WIDTH,
              minHeight: 720,
            }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            referrerPolicy="no-referrer-when-downgrade"
          />
        ) : (
          <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm font-medium text-blue-950">{link.label}</p>
            <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
              {link.hint} This site cannot open inside the side panel (Google blocks embedded pages — 403).
            </p>
            <Button type="button" variant="chromePill" size="sm" onClick={openExternal}>
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Open in browser
            </Button>
          </div>
        )}
      </div>
      <Dialog open={addAddressOpen} onOpenChange={setAddAddressOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add new address</DialogTitle>
            <DialogDescription>Save a typing website URL for the side panel (stored on this device).</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="qt-typing-link-label">Name</Label>
              <Input
                id="qt-typing-link-label"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="My typing site"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="qt-typing-link-url">Address (URL)</Label>
              <Input
                id="qt-typing-link-url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://example.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="chromePill" size="sm" onClick={() => setAddAddressOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="chromePill"
              size="sm"
              onClick={() => {
                const entry = addCustomTypingLink(newLabel, newUrl);
                if (!entry) return;
                setLinkOptions(listQuotationTypingLinksForUi());
                onLinkIdChange(entry.id);
                setNewLabel("");
                setNewUrl("");
                setAddAddressOpen(false);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
