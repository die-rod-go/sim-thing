import { useEffect, useRef } from "react";
import { resolveShortcut, type ShortcutAction } from "../format/shortcuts";

const TYPING_TAGS: ReadonlySet<string> = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return TYPING_TAGS.has(target.tagName) || target.isContentEditable;
}

/** Global keyboard shortcuts; ignored while typing and when a modifier key is held. */
export function useShortcuts(onShortcut: (action: ShortcutAction) => void): void {
  const handlerRef = useRef(onShortcut);
  useEffect(() => {
    handlerRef.current = onShortcut;
  }, [onShortcut]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      const action = resolveShortcut(event.key);
      if (action === null) return;
      event.preventDefault();
      handlerRef.current(action);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
