"use client";

import { useState, type MouseEvent } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getLoanFormIntro, type LoanIntroLang } from "../constants/loanFormIntros";

type Props = {
  introKey: string;
  compact?: boolean;
  className?: string;
};

const LANGS: { id: LoanIntroLang; label: string }[] = [
  { id: "en", label: "English" },
  { id: "hi", label: "हिन्दी" },
  { id: "ne", label: "नेपाली" },
];

/** (i) only — full intro in English / हिन्दी / नेपाली tabs, default English. */
export function LoanHelpInfo({ introKey, compact = false, className }: Props) {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<LoanIntroLang>("en");
  const copy = getLoanFormIntro(introKey);
  if (!copy) return null;

  const stop = (e: MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <>
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex shrink-0 items-center justify-center rounded-full text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700 dark:text-sky-400 dark:hover:bg-sky-950/40",
                compact ? "h-3.5 w-3.5" : "h-4 w-4",
                className
              )}
              aria-label={`${copy.en.title} — information`}
              onClick={(e) => {
                stop(e);
                e.preventDefault();
                setLang("en");
                setOpen(true);
              }}
              onMouseDown={stop}
              onPointerDown={stop}
            >
              <Info className={cn(compact ? "h-3.5 w-3.5" : "h-4 w-4", "stroke-[2]")} aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[260px] text-xs">
            Click for full introduction (English / हिन्दी / नेपाली). Default English.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="z-[140] flex max-h-[min(90vh,42rem)] w-[min(96vw,38rem)] max-w-xl flex-col gap-0 overflow-hidden p-0 sm:rounded-lg"
          overlayClassName="z-[140]"
          onClick={stop}
          onMouseDown={stop}
          onPointerDown={stop}
        >
          <DialogHeader className="space-y-1 border-b px-5 pb-3 pt-5 text-left">
            <DialogTitle className="text-base sm:text-lg">{copy[lang].title}</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Choose a language tab. Help stays inside this (i) window only.
            </DialogDescription>
          </DialogHeader>
          <Tabs
            value={lang}
            onValueChange={(v) => setLang(v as LoanIntroLang)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="border-b px-4 pt-3">
              <TabsList className="grid h-10 w-full grid-cols-3">
                {LANGS.map((l) => (
                  <TabsTrigger key={l.id} value={l.id} className="text-xs sm:text-sm">
                    {l.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {LANGS.map((l) => {
                const block = copy[l.id];
                return (
                  <TabsContent key={l.id} value={l.id} className="m-0 space-y-3 focus-visible:outline-none">
                    <p className="text-sm font-semibold leading-snug sm:text-base">{block.title}</p>
                    {block.paragraphs.map((p, i) => (
                      <p key={`${l.id}-${i}`} className="text-sm leading-relaxed text-foreground/90">
                        {p}
                      </p>
                    ))}
                  </TabsContent>
                );
              })}
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
