"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { appNavHref } from "@/lib/appNavHref";

type DashboardStatCardTxnLinkProps = {
  href: string;
  className?: string;
  children: React.ReactNode;
};

/** Dashboard stat card txn count: client `router.push` + static `appNavHref` — `<Link>` / galat path par full reload kam. */
export function DashboardStatCardTxnLink({
  href,
  className,
  children,
}: DashboardStatCardTxnLinkProps) {
  const router = useRouter();

  return (
    <button
      type="button"
      className={cn(className)}
      onClick={() => router.push(appNavHref(href), { scroll: false })}
    >
      {children}
    </button>
  );
}
