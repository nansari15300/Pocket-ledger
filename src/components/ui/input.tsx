import * as React from "react"

import { cn } from "@/lib/utils"

export type InputProps = React.ComponentProps<"input"> & {
  /** Master–detail list search row — h-10 se ~30% kam (h-7) */
  listChrome?: boolean
  /** List search: left icon overlay — `pl-7` taaki placeholder/text overlap na ho */
  listChromeSearch?: boolean
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, listChrome, listChromeSearch, type, ...props }, ref) => {
    return (
      <input
        type={type}
        // Input width lock: long values should scroll/clip inside field, not expand layout.
        className={cn(
          listChrome
            ? cn(
                "flex h-7 min-h-7 max-h-7 w-full min-w-0 max-w-full rounded-md border border-input bg-background py-0 text-xs ring-offset-background file:border-0 file:bg-transparent file:text-xs file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                listChromeSearch ? "pl-7 pr-2" : "px-2"
              )
            : "flex h-10 w-full min-w-0 max-w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
