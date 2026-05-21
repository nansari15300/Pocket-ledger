"use client";

/**
 * A/c No / mobile se multiple company ya account mile to user ek choose kare (avatar optional).
 */
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ResolvedEntityAvatar } from "@/components/entity/ResolvedEntityAvatar";
import {
  interCompanyIcAvatarClass,
  interCompanyIcAvatarFallbackClass,
} from "@/lib/interCompany/interCompanyVoucherChrome";
import { cn } from "@/lib/utils";

export type InterCompanyPickOption = {
  id: string;
  label: string;
  subLabel?: string;
  /** Party/staff photo — admin / entity par ho to dikhao */
  avatarUrl?: string | null;
  avatarFallback?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  options: InterCompanyPickOption[];
  onSelect: (id: string) => void;
  showAvatars?: boolean;
};

export function InterCompanyMultiPickDialog({
  open,
  onOpenChange,
  title,
  description,
  options,
  onSelect,
  showAvatars = true,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[min(50vh,20rem)] pr-2">
          <ul className="space-y-2">
            {options.map((opt) => (
              <li key={opt.id}>
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto w-full justify-start gap-2 whitespace-normal py-2 text-left"
                  onClick={() => {
                    onSelect(opt.id);
                    onOpenChange(false);
                  }}
                >
                  {showAvatars && (opt.avatarUrl || opt.avatarFallback) ? (
                    <ResolvedEntityAvatar
                      src={opt.avatarUrl}
                      alt={opt.label}
                      fallbackText={opt.avatarFallback || opt.label.slice(0, 2).toUpperCase()}
                      className={cn("h-9 w-9 shrink-0", interCompanyIcAvatarClass)}
                      fallbackClassName={interCompanyIcAvatarFallbackClass}
                    />
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{opt.label}</span>
                    {opt.subLabel ? (
                      <span className="block text-xs font-normal text-muted-foreground">
                        {opt.subLabel}
                      </span>
                    ) : null}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
