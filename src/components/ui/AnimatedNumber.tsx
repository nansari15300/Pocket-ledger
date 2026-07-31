
"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, type ReactNode, useState } from "react";

export default function AnimatedNumber({ value, formatter, duration = 1 }: { value: number, formatter: (n: number) => ReactNode, duration?: number }) {
  const formatterRef = useRef(formatter);
  const currentValueRef = useRef(0);
  const hasMountedRef = useRef(false);
  const [displayValue, setDisplayValue] = useState<ReactNode>(() => formatter(0));

  useEffect(() => {
    formatterRef.current = formatter;
    window.queueMicrotask(() => setDisplayValue(formatter(currentValueRef.current)));
  }, [formatter]);
  
  useEffect(() => {
    let raf = 0;
    const isFirst = !hasMountedRef.current;
    hasMountedRef.current = true;
    const start = isFirst ? 0 : currentValueRef.current;
    const end = Number(value) || 0;
    const durationMs = Math.max(0, Number(duration) || 0) * 1000;
    const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (durationMs <= 0 || start === end) {
      currentValueRef.current = end;
      setDisplayValue(formatterRef.current(end));
      return;
    }
    const tick = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - startedAt) / durationMs));
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = start + (end - start) * eased;
      currentValueRef.current = next;
      setDisplayValue(formatterRef.current(next));
      if (progress < 1) raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [value, duration]);

  return (
    <motion.span>
      {displayValue}
    </motion.span>
  );
}
