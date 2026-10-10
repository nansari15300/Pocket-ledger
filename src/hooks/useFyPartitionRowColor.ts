"use client";

import * as React from "react";
import {
  FY_PARTITION_ROW_COLOR_CHANGED_EVENT,
  getFyPartitionRowBackground,
  readFyPartitionRowColor,
  writeFyPartitionRowColor,
  type FyPartitionRowColor,
  type FyPartitionRowColorTarget,
} from "@/lib/fyPartitionRowColor";

export function useFyPartitionRowColor(target: FyPartitionRowColorTarget = "end") {
  const [color, setColorState] = React.useState<FyPartitionRowColor>("default");

  React.useEffect(() => {
    const sync = () => {
      const next = readFyPartitionRowColor(target);
      const background = getFyPartitionRowBackground(next);
      setColorState(next);
      const root = document.documentElement;
      const attribute = `data-pl-fy-${target}-row-color`;
      const property = `--pl-fy-${target}-row-bg`;
      if (background) {
        root.setAttribute(attribute, next);
        root.style.setProperty(property, background);
      } else {
        root.removeAttribute(attribute);
        root.style.removeProperty(property);
      }
    };
    sync();
    window.addEventListener(FY_PARTITION_ROW_COLOR_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(FY_PARTITION_ROW_COLOR_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [target]);

  const setColor = React.useCallback((next: FyPartitionRowColor) => {
    setColorState(next);
    writeFyPartitionRowColor(target, next);
  }, [target]);

  return {
    color,
    backgroundColor: getFyPartitionRowBackground(color),
    setColor,
  };
}
