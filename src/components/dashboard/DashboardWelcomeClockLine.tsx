"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useDate } from "@/hooks/useDate";
import { cn } from "@/lib/utils";

/** Welcome card clock — alag component taaki poora dashboard har second re-render na ho. */
export function DashboardWelcomeClockLine({ className }: { className?: string }) {
  const { dateSystem, formatDate, formatDateBS } = useDate();
  const [liveTime, setLiveTime] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setLiveTime(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const line = useMemo(() => {
    const d = liveTime;
    if (!(d instanceof Date) || isNaN(d.getTime())) return "";
    const weekday = format(d, "EEEE");
    const timePart = d.toLocaleTimeString();
    if (dateSystem === "AD") {
      return `${weekday}, ${formatDate(d)} (AD) | ${timePart}`;
    }
    if (dateSystem === "BS") {
      return `${weekday}, ${formatDateBS(d)} (BS) | ${timePart}`;
    }
    return `${weekday} · AD ${formatDate(d)} · BS ${formatDateBS(d)} | ${timePart}`;
  }, [liveTime, dateSystem, formatDate, formatDateBS]);

  return <p className={cn("text-sm text-muted-foreground font-mono", className)}>{line}</p>;
}
