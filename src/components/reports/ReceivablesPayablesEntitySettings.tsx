"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  DEFAULT_RP_HIDDEN_CATEGORIES,
  RP_VISIBILITY_CATEGORIES,
  type RpVisibilityCategory,
} from "@/lib/receivablesPayablesEntityKeys";
import { useMasterListRowMotion } from "@/hooks/useMasterListRowMotion";

type ReceivablesPayablesEntitySettingsProps = {
  hiddenCategories: Set<RpVisibilityCategory>;
  canEdit: boolean;
  onSave: (hiddenCategories: RpVisibilityCategory[]) => Promise<void>;
};

export function ReceivablesPayablesEntitySettings({
  hiddenCategories,
  canEdit,
  onSave,
}: ReceivablesPayablesEntitySettingsProps) {
  const [open, setOpen] = useState(false);
  const [draftHidden, setDraftHidden] = useState<Set<RpVisibilityCategory>>(new Set());
  const [saving, setSaving] = useState(false);
  const { animatePresenceMode, rowMotionProps } = useMasterListRowMotion();

  useEffect(() => {
    if (open) setDraftHidden(new Set(hiddenCategories));
  }, [open, hiddenCategories]);

  const toggleVisible = (id: RpVisibilityCategory, checked: boolean) => {
    if (!canEdit) return;
    setDraftHidden((prev) => {
      const next = new Set(prev);
      if (checked) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDefault = () => {
    if (!canEdit) return;
    setDraftHidden(new Set(DEFAULT_RP_HIDDEN_CATEGORIES));
  };

  const handleSave = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      await onSave([...draftHidden]);
      setOpen(false);
      toast.success("Outstanding visibility saved for all users.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not save settings.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        type="button"
        className="h-9 w-9 shrink-0 p-0"
        title={canEdit ? "Show / hide categories" : "Only company owner can change visibility"}
        disabled={!canEdit}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Settings className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="z-[60] max-w-sm gap-0 p-0 sm:rounded-lg"
          overlayClassName="z-[60] bg-black/35 backdrop-blur-[2px]"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.stopPropagation()}
        >
          <DialogHeader className="border-b px-4 py-3 text-left">
            <DialogTitle className="text-base">Outstanding visibility</DialogTitle>
            <DialogDescription className="text-xs">
              Tick = category show in list & totals. Saved for whole company.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 border-b px-4 py-2">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={handleDefault}>
              Default
            </Button>
          </div>

          <ul className="space-y-1 p-4">
            <AnimatePresence mode={animatePresenceMode}>
              {RP_VISIBILITY_CATEGORIES.map(({ id, label }) => {
                const checked = !draftHidden.has(id);
                return (
                  <motion.li key={id} className="min-w-0" {...rowMotionProps}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-md border border-border/80 bg-muted/30 px-3 py-2.5 hover:bg-muted/50",
                        !canEdit && "cursor-not-allowed opacity-60"
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={!canEdit}
                        onCheckedChange={(v) => toggleVisible(id, v === true)}
                      />
                      <span className="text-sm font-medium">{label}</span>
                    </label>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>

          <div className="flex justify-end gap-2 border-t px-4 py-3">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={!canEdit || saving} onClick={handleSave}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
