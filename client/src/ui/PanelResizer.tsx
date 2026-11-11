import type { PointerEvent as ReactPointerEvent } from "react";
import { clientConfig } from "../client-config";
import { clampSidePanelWidth } from "../format/shell-layout";

/** The drag handle on the side panel's left edge; dragging left widens the panel. */
export function PanelResizer({
  width,
  onWidthChange,
}: {
  width: number;
  onWidthChange: (width: number) => void;
}) {
  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = width;
    const followPointer = (moveEvent: PointerEvent) => {
      const draggedWidth = startWidth + startX - moveEvent.clientX;
      onWidthChange(clampSidePanelWidth(draggedWidth, window.innerWidth, clientConfig.shell));
    };
    const endDrag = () => {
      handle.removeEventListener("pointermove", followPointer);
      handle.removeEventListener("pointerup", endDrag);
      handle.removeEventListener("pointercancel", endDrag);
    };
    handle.addEventListener("pointermove", followPointer);
    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);
  };

  return (
    <div
      className="panel-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the side panel"
      onPointerDown={startDrag}
    />
  );
}
