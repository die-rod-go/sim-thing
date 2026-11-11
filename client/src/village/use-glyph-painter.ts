import { useEffect, useState } from "react";
import { clientConfig } from "../client-config";
import { createGlyphPainter, loadImage, type GlyphPainter } from "./glyph-painter";

export type GlyphPainterStatus =
  | { kind: "loading" }
  | { kind: "ready"; glyphPainter: GlyphPainter }
  | { kind: "error"; message: string };

/** Loads the glyph sheet once, for views that draw glyphs without the map. */
export function useGlyphPainter(): GlyphPainterStatus {
  const [status, setStatus] = useState<GlyphPainterStatus>({ kind: "loading" });

  useEffect(() => {
    let isCurrent = true;
    loadImage(clientConfig.map.glyphSheetUrl).then(
      (sheetImage) => {
        if (isCurrent) setStatus({ kind: "ready", glyphPainter: createGlyphPainter(sheetImage) });
      },
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        if (isCurrent) setStatus({ kind: "error", message });
      },
    );
    return () => {
      isCurrent = false;
    };
  }, []);

  return status;
}
