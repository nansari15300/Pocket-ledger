
"use client";

import { animate, motion, useMotionValue } from "framer-motion";
import { useEffect, useRef, type ReactNode, useState } from "react";

export default function AnimatedNumber({ value, formatter, duration = 1 }: { value: number, formatter: (n: number) => ReactNode, duration?: number }) {
  const motionValue = useMotionValue(0);
  const formatterRef = useRef(formatter);
  const [displayValue, setDisplayValue] = useState<ReactNode>(() => formatter(0));

  useEffect(() => {
    formatterRef.current = formatter;
    window.queueMicrotask(() => setDisplayValue(formatter(motionValue.get())));
  }, [formatter, motionValue]);
  
  useEffect(() => {
    const unsubscribe = motionValue.on("change", (latest) => {
      setDisplayValue(formatterRef.current(Number(latest) || 0));
    });
    const controls = animate(motionValue, value, {
      duration: duration,
      ease: "easeOut",
    });
    return () => {
      unsubscribe();
      controls.stop();
    };
  }, [value, duration, motionValue]);

  return (
    <motion.span>
      {displayValue}
    </motion.span>
  );
}
