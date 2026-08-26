import * as React from "react"

import { cn } from "@/lib/utils"
import { shouldAutoCapitalizeTextField, shouldNormalizeOnTextChange, toFirstLetterCapitalWords } from "@/lib/textAutoCapitalize"

export type InputProps = React.ComponentProps<"input"> & {
  /** Master–detail list search row — h-10 se ~30% kam (h-7) */
  listChrome?: boolean
  /** List search: left icon overlay — `pl-7` taaki placeholder/text overlap na ho */
  listChromeSearch?: boolean
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, listChrome, listChromeSearch, type, onChange, onBlur, ...props }, ref) => {
    const inputType = listChromeSearch && !type ? "search" : type;
    const autoCapText = shouldAutoCapitalizeTextField({
      type: inputType,
      name: props.name,
      placeholder: props.placeholder,
      ariaLabel: props["aria-label"],
      autoCapitalize: props.autoCapitalize,
      disabled: props.disabled,
      readOnly: props.readOnly,
    });
    const normalizeTarget = (target: HTMLInputElement) => {
      if (!autoCapText) return;
      const next = toFirstLetterCapitalWords(target.value);
      if (next !== target.value) target.value = next;
    };
    return (
      <input
        type={inputType}
        // Input width lock: long values should scroll/clip inside field, not expand layout.
        className={cn(
          listChrome
            ? cn(
                "flex h-6 min-h-6 max-h-6 w-full min-w-0 max-w-full rounded-md border border-input bg-background py-0 text-xs ring-offset-background file:border-0 file:bg-transparent file:text-xs file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                listChromeSearch ? "pl-7 pr-7" : "px-2"
              )
            : "flex h-10 w-full min-w-0 max-w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
        onChange={(event) => {
          if (autoCapText && shouldNormalizeOnTextChange(event.currentTarget.value)) {
            normalizeTarget(event.currentTarget);
          }
          onChange?.(event);
        }}
        onBlur={(event) => {
          normalizeTarget(event.currentTarget);
          onBlur?.(event);
        }}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
