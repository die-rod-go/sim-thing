import { z } from "zod";

/**
 * The glyph sheet: a 16×16 grid of 8 px CP437 glyphs, drawn white on transparent so any color can
 * be painted over them. A glyph's index is its CP437 code (65 is "A", 219 is a full block).
 */
export const GLYPH_SHEET = {
  fileName: "acorn-tileset-8x8.png",
  columns: 16,
  rows: 16,
  glyphSizePixels: 8,
} as const;

export const GLYPH_COUNT = GLYPH_SHEET.columns * GLYPH_SHEET.rows;

export const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/;

const hexColorSchema = z.string().regex(HEX_COLOR_PATTERN, 'Write a color as lowercase "#rrggbb".');

/** How a thing is drawn: one glyph of the sheet in a color, over an optional background color. */
export const glyphSchema = z.strictObject({
  index: z
    .number()
    .int()
    .nonnegative()
    .max(GLYPH_COUNT - 1),
  color: hexColorSchema,
  /** Fills the whole tile behind the glyph; without it whatever is underneath shows through. */
  background: hexColorSchema.optional(),
});
export type Glyph = z.infer<typeof glyphSchema>;

/** Where a glyph sits in the sheet, in sheet pixels. */
export function findGlyphSourcePosition(index: number): { x: number; y: number } {
  const { columns, glyphSizePixels } = GLYPH_SHEET;
  return {
    x: (index % columns) * glyphSizePixels,
    y: Math.floor(index / columns) * glyphSizePixels,
  };
}
