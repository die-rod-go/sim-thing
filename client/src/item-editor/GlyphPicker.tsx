import { useEffect, useRef, type MouseEvent } from "react";
import { GLYPH_COUNT, GLYPH_SHEET, type Glyph } from "@village/shared";
import { NumberInput } from "../characters/fields";
import { clientConfig } from "../client-config";
import type { GlyphPainter } from "../village/glyph-painter";
import { useGlyphPainter } from "../village/use-glyph-painter";
import { Checkbox, InlineField } from "./widgets";

const { glyphSizePixels, columns, rows } = GLYPH_SHEET;

function clampGlyphIndex(index: number): number {
  return Math.min(GLYPH_COUNT - 1, Math.max(0, Math.round(index)));
}

function getCanvasContext(canvas: HTMLCanvasElement | null): CanvasRenderingContext2D {
  const context = canvas?.getContext("2d");
  if (!context) throw new Error("The browser could not create a 2D canvas for the glyph picker");
  context.imageSmoothingEnabled = false;
  return context;
}

function setBackground(glyph: Glyph, isOn: boolean): Glyph {
  if (isOn) return { ...glyph, background: clientConfig.itemEditor.glyphGridBackground };
  return { index: glyph.index, color: glyph.color };
}

/** The chosen glyph in its colors, scaled up so it can be told apart. */
function GlyphPreview({ glyph, glyphPainter }: { glyph: Glyph; glyphPainter: GlyphPainter }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = glyphSizePixels * clientConfig.itemEditor.glyphPreviewScale;

  useEffect(() => {
    const context = getCanvasContext(canvasRef.current);
    context.clearRect(0, 0, size, size);
    glyphPainter.drawGlyph(context, glyph, { x: 0, y: 0, width: size, height: size });
  }, [glyph, glyphPainter, size]);

  return <canvas className="glyph-preview" ref={canvasRef} width={size} height={size} />;
}

/** Every glyph of the sheet in the item's colors; clicking one picks it. */
function GlyphGrid({
  glyph,
  glyphPainter,
  onPick,
}: {
  glyph: Glyph;
  glyphPainter: GlyphPainter;
  onPick: (index: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cellSize = glyphSizePixels * clientConfig.itemEditor.glyphGridScale;

  useEffect(() => {
    const context = getCanvasContext(canvasRef.current);
    const background = glyph.background ?? clientConfig.itemEditor.glyphGridBackground;
    for (let index = 0; index < GLYPH_COUNT; index++) {
      glyphPainter.drawGlyph(
        context,
        { index, color: glyph.color, background },
        {
          x: (index % columns) * cellSize,
          y: Math.floor(index / columns) * cellSize,
          width: cellSize,
          height: cellSize,
        },
      );
    }
    context.strokeStyle = glyph.color;
    context.strokeRect(
      (glyph.index % columns) * cellSize + 0.5,
      Math.floor(glyph.index / columns) * cellSize + 0.5,
      cellSize - 1,
      cellSize - 1,
    );
  }, [glyph, glyphPainter, cellSize]);

  const pickAt = (event: MouseEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const column = Math.floor(((event.clientX - bounds.left) / bounds.width) * columns);
    const row = Math.floor(((event.clientY - bounds.top) / bounds.height) * rows);
    onPick(clampGlyphIndex(row * columns + column));
  };

  return (
    <canvas
      className="glyph-grid"
      ref={canvasRef}
      width={columns * cellSize}
      height={rows * cellSize}
      onClick={pickAt}
    />
  );
}

/** A glyph of the sheet, its color and an optional background, with a grid to pick from. */
export function GlyphPicker({
  glyph,
  onChange,
}: {
  glyph: Glyph;
  onChange: (glyph: Glyph) => void;
}) {
  const status = useGlyphPainter();
  if (status.kind === "error") return <span className="muted">{status.message}</span>;
  if (status.kind === "loading") return <span className="muted">Loading the glyph sheet…</span>;
  const { glyphPainter } = status;
  const hasBackground = glyph.background !== undefined;

  return (
    <span className="glyph-picker">
      <GlyphPreview glyph={glyph} glyphPainter={glyphPainter} />
      <InlineField label="glyph">
        <NumberInput
          value={glyph.index}
          min={0}
          onChange={(index) => onChange({ ...glyph, index: clampGlyphIndex(index) })}
        />
      </InlineField>
      <InlineField label="color">
        <input
          type="color"
          className="glyph-color"
          value={glyph.color}
          onChange={(event) => onChange({ ...glyph, color: event.target.value })}
        />
      </InlineField>
      <Checkbox
        label="background"
        checked={hasBackground}
        onChange={(isOn) => onChange(setBackground(glyph, isOn))}
      />
      {hasBackground && (
        <input
          type="color"
          className="glyph-color"
          value={glyph.background}
          onChange={(event) => onChange({ ...glyph, background: event.target.value })}
        />
      )}
      <details className="glyph-grid-toggle">
        <summary>choose from sheet</summary>
        <GlyphGrid
          glyph={glyph}
          glyphPainter={glyphPainter}
          onPick={(index) => onChange({ ...glyph, index })}
        />
      </details>
    </span>
  );
}
