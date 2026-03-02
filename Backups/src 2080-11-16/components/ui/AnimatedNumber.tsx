
"use client";

import { motion, useMotionValue, useSpring, useTransform, MotionValue, animate } from "framer-motion";
import { useEffect, ReactNode, useRef } from "react";

export default function AnimatedNumber({ value, formatter, duration = 1 }: { value: number, formatter: (n: number) => ReactNode, duration?: number }) {
  const motionValue = useMotionValue(0);

  const display: MotionValue<ReactNode> = useTransform(motionValue, (latest) =>
    formatter(latest)
  );
  
  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration: duration,
      ease: "easeOut",
    });
    return controls.stop;
  }, [value, duration, motionValue]);

  return (
    <motion.span>
      {/* Type assertion to help TypeScript understand that this is acceptable */}
      {display as any}
    </motion.span>
  );
}
