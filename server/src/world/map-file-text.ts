const ROW_PLACEHOLDER_PREFIX = "@@tile-layer-";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTileLayer(layer: unknown): layer is { data: number[]; width: number } {
  return (
    isRecord(layer) &&
    layer.type === "tilelayer" &&
    typeof layer.width === "number" &&
    Array.isArray(layer.data)
  );
}

function formatTileRows(data: readonly number[], width: number): string {
  const rows: string[] = [];
  for (let rowStart = 0; rowStart < data.length; rowStart += width) {
    rows.push(data.slice(rowStart, rowStart + width).join(", "));
  }
  return `[${rows.join(",\n  ")}]`;
}

/**
 * The map as JSON text with one line per row of tiles, so it stays readable and diffs show which
 * tiles changed. Anything else is written as ordinary one-space-indented JSON, as Tiled does.
 */
export function formatMapFileText(json: unknown): string {
  if (!isRecord(json) || !Array.isArray(json.layers)) return `${JSON.stringify(json, null, 1)}\n`;
  const layers: unknown[] = json.layers;
  const withPlaceholders = {
    ...json,
    layers: layers.map((layer, layerIndex) =>
      isTileLayer(layer) ? { ...layer, data: `${ROW_PLACEHOLDER_PREFIX}${layerIndex}` } : layer,
    ),
  };
  let text = JSON.stringify(withPlaceholders, null, 1);
  layers.forEach((layer, layerIndex) => {
    if (!isTileLayer(layer)) return;
    text = text.replace(
      `"${ROW_PLACEHOLDER_PREFIX}${layerIndex}"`,
      formatTileRows(layer.data, layer.width),
    );
  });
  return `${text}\n`;
}
