"use client";

import type { ResizeHandle } from "@/lib/usePersistedResizableDialogSize";

type ResizableDialogEdgeHandlesProps = {
  onResizeStart: (e: React.MouseEvent, handle: ResizeHandle) => void;
  /** Also render top, left and the other three corner grips. */
  allSides?: boolean;
};

/** Right, bottom, and bottom-right resize grips (centered dialog — grow only). */
export function ResizableDialogEdgeHandles({ onResizeStart, allSides = false }: ResizableDialogEdgeHandlesProps) {
  return (
    <>
      {allSides ? (
        <>
          <div className="absolute left-8 right-8 top-0 z-20 h-2 cursor-row-resize hover:bg-primary/15" onMouseDown={(e) => onResizeStart(e, "n")} aria-hidden />
          <div className="absolute bottom-8 left-0 top-8 z-20 w-2 cursor-col-resize hover:bg-primary/15" onMouseDown={(e) => onResizeStart(e, "w")} aria-hidden />
          <div className="absolute left-0 top-0 z-30 h-5 w-5 cursor-nw-resize hover:bg-primary/20" onMouseDown={(e) => onResizeStart(e, "nw")} aria-hidden />
          <div className="absolute right-0 top-0 z-30 h-5 w-5 cursor-ne-resize hover:bg-primary/20" onMouseDown={(e) => onResizeStart(e, "ne")} aria-hidden />
          <div className="absolute bottom-0 left-0 z-30 h-5 w-5 cursor-sw-resize hover:bg-primary/20" onMouseDown={(e) => onResizeStart(e, "sw")} aria-hidden />
        </>
      ) : null}
      <div
        className="absolute right-0 top-8 bottom-8 z-20 w-2 cursor-col-resize rounded-r hover:bg-primary/15"
        onMouseDown={(e) => onResizeStart(e, "e")}
        aria-hidden
      />
      <div
        className="absolute bottom-0 left-8 right-8 z-20 h-2 cursor-row-resize rounded-b hover:bg-primary/15"
        onMouseDown={(e) => onResizeStart(e, "s")}
        aria-hidden
      />
      <div
        className="absolute bottom-0 right-0 z-30 h-5 w-5 cursor-se-resize rounded-br hover:bg-primary/20"
        onMouseDown={(e) => onResizeStart(e, "se")}
        aria-hidden
        title="Resize"
      />
    </>
  );
}
