import { useEffect, useRef, useState, type RefObject } from "react";

export interface Popover {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  toggle: () => void;
  containerRef: RefObject<HTMLDivElement | null>;
}

/**
 * Open/closed state for a small menu that closes on a click outside it or on Esc. Esc is caught in
 * the capture phase so the global Esc shortcut (deselect) doesn't also fire while a menu is open.
 */
export function usePopover(controlled?: {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}): Popover {
  const [ownIsOpen, setOwnIsOpen] = useState(false);
  const isOpen = controlled?.isOpen ?? ownIsOpen;
  const setIsOpen = controlled?.setIsOpen ?? setOwnIsOpen;
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const container = containerRef.current;
      if (container && event.target instanceof Node && !container.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setIsOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("keydown", closeOnEscape, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("keydown", closeOnEscape, { capture: true });
    };
  }, [isOpen, setIsOpen]);

  return { isOpen, setIsOpen, toggle: () => setIsOpen(!isOpen), containerRef };
}
