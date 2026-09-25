"use client";

type ResizableDialogEdgeHandlesProps = {
  onResizeStart: (e: React.MouseEvent, handle: "e" | "s" | "se") => void;
};

/** Right, bottom, and bottom-right resize grips (centered dialog — grow only). */
export function ResizableDialogEdgeHandles({ onResizeStart }: ResizableDialogEdgeHandlesProps) {
  return (
    <>
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
