import * as React from "react"

import { cn } from "@/lib/utils"
import { formatAmountInputDisplay, sanitizeAmountInputString } from "@/lib/amountInputNormalize"
import { shouldAutoCapitalizeTextField, shouldNormalizeOnTextChange, toFirstLetterCapitalWords } from "@/lib/textAutoCapitalize"

export type InputProps = React.ComponentProps<"input"> & {
  /** Master–detail list search row — h-10 se ~30% kam (h-7) */
  listChrome?: boolean
  /** List search: left icon overlay — `pl-7` taaki placeholder/text overlap na ho */
  listChromeSearch?: boolean
}

const inputShellClass = (
  listChrome?: boolean,
  listChromeSearch?: boolean,
  className?: string,
  ledgerTxnSearch?: boolean
) =>
  cn(
    ledgerTxnSearch
      ? "flex h-9 min-h-9 max-h-9 w-full min-w-0 max-w-full rounded-md border border-blue-300 bg-background py-0 pl-7 pr-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50"
      : listChrome
        ? cn(
            "flex h-6 min-h-6 max-h-6 w-full min-w-0 max-w-full rounded-md border bg-background py-0 text-xs file:border-0 file:bg-transparent file:text-xs file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50",
            listChromeSearch ? "border-blue-300 pl-7 pr-7" : "border-input px-2"
          )
        : "flex h-10 w-full min-w-0 max-w-full rounded-md border border-input bg-background px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50",
    className
  )

const LEDGER_TXN_SEARCH_PLACEHOLDERS = new Set(["search transactions", "search notes"]);

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, listChrome, listChromeSearch, type, onChange, onBlur, onFocus, ...props }, ref) => {
    const placeholderKey = String(props.placeholder ?? "").trim().toLowerCase();
    const ledgerTxnSearch = LEDGER_TXN_SEARCH_PLACEHOLDERS.has(placeholderKey);
    const useListChrome = listChrome || ledgerTxnSearch;
    const useListChromeSearch = listChromeSearch || ledgerTxnSearch;
    const inputType = useListChromeSearch && !type ? "search" : type;
    const rawNumberInput = props["data-pl-raw-number"] != null;
    const amountNumberMode = type === "number" && !rawNumberInput;

    const [amountDraft, setAmountDraft] = React.useState<string | null>(null);

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

    if (amountNumberMode) {
      const { value, defaultValue, readOnly, disabled, ...rest } = props;
      const controlled = value !== undefined;
      const displayValue =
        amountDraft !== null
          ? amountDraft
          : controlled
            ? formatAmountInputDisplay(value)
            : undefined;

      return (
        <input
          {...rest}
          type="text"
          inputMode="decimal"
          data-pl-amount-input=""
          data-pl-mlc-search-input={listChromeSearch ? "" : undefined}
          className={inputShellClass(listChrome, listChromeSearch, className)}
          ref={ref}
          readOnly={readOnly}
          disabled={disabled}
          value={displayValue}
          defaultValue={controlled ? undefined : defaultValue}
          onFocus={(event) => {
            if (!readOnly && !disabled) {
              const seed = controlled
                ? formatAmountInputDisplay(value)
                : sanitizeAmountInputString(event.currentTarget.value);
              setAmountDraft(seed);
            }
            onFocus?.(event);
          }}
          onChange={(event) => {
            const next = sanitizeAmountInputString(event.currentTarget.value);
            event.currentTarget.value = next;
            setAmountDraft(next);
            onChange?.(event);
          }}
          onBlur={(event) => {
            setAmountDraft(null);
            onBlur?.(event);
          }}
        />
      );
    }

    return (
      <input
        type={inputType}
        data-pl-mlc-search-input={useListChromeSearch ? "" : undefined}
        data-pl-ledger-txn-search={ledgerTxnSearch ? "" : undefined}
        className={inputShellClass(useListChrome, useListChromeSearch, className, ledgerTxnSearch)}
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
