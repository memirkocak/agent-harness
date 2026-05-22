import { resolve, relative } from "node:path";
import { PROJECT_ROOT, MAX_READ_FILE_BYTES } from "../config.ts";

/**
 * Résout un chemin relatif sous PROJECT_ROOT (pas de traversal).
 */
export function resolveProjectPath(relativePath: string): string {
  const trimmed = relativePath.trim().replace(/^["']|["']$/g, "");
  if (!trimmed) throw new Error("chemin requis");

  const root = resolve(PROJECT_ROOT);
  const absolute = resolve(root, trimmed);
  const rel = relative(root, absolute);

  if (rel.startsWith("..") || rel.includes(".." + "/")) {
    throw new Error(`Chemin hors projet interdit : ${relativePath}`);
  }

  return absolute;
}

export function maxReadBytes(): number {
  return MAX_READ_FILE_BYTES;
}
