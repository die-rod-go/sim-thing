import { useEffect, type RefObject } from "react";
import { clientConfig } from "../client-config";
import type { CameraControls } from "./use-camera-rig";

const TYPING_TAGS: ReadonlySet<string> = new Set(["INPUT", "SELECT", "TEXTAREA"]);

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return TYPING_TAGS.has(target.tagName) || target.isContentEditable;
}

function useWheelZoom(containerRef: RefObject<HTMLElement | null>, controls: CameraControls): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const bounds = container.getBoundingClientRect();
      const zoomFactor = Math.exp(-event.deltaY * clientConfig.camera.wheelZoomSensitivity);
      controls.zoomAt(zoomFactor, {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });
    };
    // Not passive: the page must not scroll while the map zooms.
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, [containerRef, controls]);
}

/** Drags pan the map; a press that barely moves stays a click, so agents can still be picked. */
function useDragPan(containerRef: RefObject<HTMLElement | null>, controls: CameraControls): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let press: { pointerId: number; lastX: number; lastY: number; travel: number } | null = null;
    let wasDragged = false;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      press = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY, travel: 0 };
      wasDragged = false;
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!press || press.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - press.lastX;
      const deltaY = event.clientY - press.lastY;
      press = { ...press, lastX: event.clientX, lastY: event.clientY };
      press.travel += Math.hypot(deltaX, deltaY);
      if (!wasDragged && press.travel < clientConfig.camera.dragThresholdPx) return;
      if (!wasDragged) {
        wasDragged = true;
        container.setPointerCapture(event.pointerId);
        container.classList.add("is-dragging");
      }
      controls.pan(deltaX, deltaY);
    };
    const onPointerEnd = (event: PointerEvent) => {
      if (!press || press.pointerId !== event.pointerId) return;
      press = null;
      container.classList.remove("is-dragging");
      if (container.hasPointerCapture(event.pointerId)) {
        container.releasePointerCapture(event.pointerId);
      }
    };
    const onClickCapture = (event: MouseEvent) => {
      if (!wasDragged) return;
      wasDragged = false;
      event.stopPropagation();
      event.preventDefault();
    };

    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerup", onPointerEnd);
    container.addEventListener("pointercancel", onPointerEnd);
    container.addEventListener("click", onClickCapture, { capture: true });
    return () => {
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerEnd);
      container.removeEventListener("pointercancel", onPointerEnd);
      container.removeEventListener("click", onClickCapture, { capture: true });
    };
  }, [containerRef, controls]);
}

/** F follows, 0 fits, + and - zoom; ignored while typing or with a modifier held. */
function useCameraKeys(controls: CameraControls, canFollow: boolean): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === "f" && canFollow) controls.toggleFollow();
      else if (key === "0") controls.fit();
      else if (key === "+" || key === "=") controls.zoomByStep(1);
      else if (key === "-" || key === "_") controls.zoomByStep(-1);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [controls, canFollow]);
}

/** Wires wheel, drag and keyboard input on the village view to its camera. */
export function useCameraInput(
  containerRef: RefObject<HTMLElement | null>,
  controls: CameraControls,
  canFollow: boolean,
): void {
  useWheelZoom(containerRef, controls);
  useDragPan(containerRef, controls);
  useCameraKeys(controls, canFollow);
}
