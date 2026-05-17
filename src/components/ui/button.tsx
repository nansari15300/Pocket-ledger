
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Global pill shape: keep all app buttons visually consistent with existing rounded action pills.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          // Global ask: white buttons -> dim blue; multi outline buttons auto alternate tone (odd/even) to avoid same color blocks.
          "border odd:border-blue-300 even:border-indigo-300 odd:bg-blue-100/80 even:bg-indigo-100/80 odd:text-blue-900 even:text-indigo-900 hover:odd:bg-blue-200/80 hover:even:bg-indigo-200/80",
        /** Header + list/detail toolbar — outline pill; active = green border (`aria-pressed` / `data-chrome-pill-active`) */
        chromePill:
          "border odd:border-blue-300 even:border-indigo-300 odd:bg-blue-100/80 even:bg-indigo-100/80 odd:text-blue-900 even:text-indigo-900 hover:odd:bg-blue-200/80 hover:even:bg-indigo-200/80 aria-pressed:border-green-600 aria-pressed:ring-2 aria-pressed:ring-green-600/40 aria-pressed:!bg-green-50/90 aria-pressed:!text-green-900 aria-pressed:odd:border-green-600 aria-pressed:even:border-green-600 data-[chrome-pill-active=true]:border-green-600 data-[chrome-pill-active=true]:ring-2 data-[chrome-pill-active=true]:ring-green-600/40 data-[chrome-pill-active=true]:!bg-green-50/90 data-[chrome-pill-active=true]:!text-green-900",
        secondary:
          "bg-sky-100/80 text-sky-900 hover:bg-sky-200/80",
        ghost: "text-slate-700 hover:bg-slate-200/70 hover:text-slate-900",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        /** Master–detail list toolbar (+ Add, etc.) — search row jitni height */
        list: "h-7 min-h-7 px-2 py-0 text-xs",
        lg: "h-11 px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
