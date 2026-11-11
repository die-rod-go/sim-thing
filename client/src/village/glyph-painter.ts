import { findGlyphSourcePosition, GLYPH_SHEET, type Glyph } from "@village/shared";

/** Draws glyphs from the sheet in any color, scaled to fill the given cell. */
export interface GlyphPainter {
  readonly sheetImage: HTMLImageElement;
  drawGlyph(
    context: CanvasRenderingContext2D,
    glyph: Glyph,
    cell: { x: number; y: number; width: number; height: number },
  ): void;
}

/** The whole sheet recolored: every glyph pixel takes the color, keeping its transparency. */
function tintSheet(sheetImage: HTMLImageElement, color: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = sheetImage.naturalWidth;
  canvas.height = sheetImage.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The browser could not create a 2D canvas to tint glyphs");
  context.drawImage(sheetImage, 0, 0);
  context.globalCompositeOperation = "source-in";
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

export function createGlyphPainter(sheetImage: HTMLImageElement): GlyphPainter {
  // One tinted copy of the sheet per color, so each draw is a single drawImage.
  const tintedSheetsByColor = new Map<string, HTMLCanvasElement>();
  const findTintedSheet = (color: string) => {
    const cached = tintedSheetsByColor.get(color);
    if (cached) return cached;
    const tinted = tintSheet(sheetImage, color);
    tintedSheetsByColor.set(color, tinted);
    return tinted;
  };

  return {
    sheetImage,
    drawGlyph(context, glyph, cell) {
      if (glyph.background) {
        context.fillStyle = glyph.background;
        context.fillRect(cell.x, cell.y, cell.width, cell.height);
      }
      const source = findGlyphSourcePosition(glyph.index);
      const { glyphSizePixels } = GLYPH_SHEET;
      // Glyphs are scaled up into tiles; smoothing would blur their pixels.
      context.imageSmoothingEnabled = false;
      context.drawImage(
        findTintedSheet(glyph.color),
        source.x,
        source.y,
        glyphSizePixels,
        glyphSizePixels,
        cell.x,
        cell.y,
        cell.width,
        cell.height,
      );
    },
  };
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${url}`));
    image.src = url;
  });
}
