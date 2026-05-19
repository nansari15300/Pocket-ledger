import { cn } from "@/lib/utils";

/** Master dialog scroll body — row-wise pill tone cycle (`globals.css`, Pro theme) */
export const masterFormScrollClassName = "pl-master-form-scroll";

/** Ek form row (2-col grid / name+ac no) — scroll body ka direct child */
export const masterFormRowClassName = "pl-master-form-row";

/** Account type / radio — pill row ke andar center, extra pt-2 mat lagao */
export const masterFormRadioGroupClassName =
  "flex h-10 w-full items-center space-x-4";

/** Special account toggle + usage table — dashboard card emerald (`pl-chrome-tone-emerald` + `globals.css`) */
export const masterSpecialAccountPanelClassName =
  "pl-master-special-account-panel pl-chrome-tone-emerald";

/** Usage control heading — normal text (dark green mat); panel gradient se match */
export const masterSpecialAccountPanelTitleClassName =
  "text-base font-semibold text-foreground";

/** Footer Cancel | mid | Save — pill tones alag (`globals.css`) */
export const masterDialogFooterChromeClassName = "pl-master-dialog-footer";

/** Scroll area: existing spacing classes ke saath `pl-master-form-scroll` jodo */
export function cnMasterFormScrollArea(...extra: (string | undefined | false | null)[]): string {
  return cn(masterFormScrollClassName, ...(extra as string[]));
}
