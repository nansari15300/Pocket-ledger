import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Master-detail / report header: color for selected entity name — same Dr/Cr tone as ledger closing rows (green if balance >= 0, red if negative).
 */
export function masterDetailBalanceToneClass(balance: unknown): string {
  if (balance === "*****") return "text-muted-foreground"
  const n = typeof balance === "number" ? balance : Number(balance)
  if (!Number.isFinite(n)) return "text-muted-foreground"
  return n >= 0 ? "text-green-600" : "text-red-600"
}
