import { renameSync, writeFileSync } from "node:fs";

/** Writes beside the file and renames over it, so a crash never leaves half a file behind. */
export function writeFileAtomically(filePath: string, text: string): void {
  const temporaryPath = `${filePath}.saving`;
  writeFileSync(temporaryPath, text, "utf8");
  renameSync(temporaryPath, filePath);
}

export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.cause instanceof Error ? `${error.message}: ${error.cause.message}` : error.message;
}
