import { createHash } from "node:crypto";

import type { NodeKind } from "./types.js";

export function stableId(...parts: string[]): string {
  return createHash("sha1").update(parts.join("\0")).digest("hex");
}

export function fileNodeId(path: string): string {
  return stableId("file", path);
}

export function symbolNodeId(
  kind: NodeKind,
  filePath: string,
  name: string,
  startLine: number,
  startColumn: number,
): string {
  return stableId(kind, filePath, name, String(startLine), String(startColumn));
}
