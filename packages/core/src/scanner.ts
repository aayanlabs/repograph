import { createReadStream } from "node:fs";
import { lstat, readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, extname, join, relative, resolve, sep } from "node:path";

import ignore, { type Ignore } from "ignore";

import type { RepositoryFile, ScanOptions, SourceLanguage } from "./types.js";

const DEFAULT_MAX_FILE_SIZE = 1024 * 1024;
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".cache",
  ".turbo",
  ".next",
  ".repograph",
]);

const LANGUAGE_BY_EXTENSION: Record<string, Exclude<SourceLanguage, null>> = {
  ".ts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".jsx": "jsx",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".go": "go",
  ".vue": "vue",
  ".svelte": "svelte",
  ".json": "json",
  ".html": "html",
  ".css": "css",
};

export async function findGitRoot(startDir: string): Promise<string> {
  const current = resolve(startDir);

  // 1. If startDir has .git, .repograph, or package.json directly, use startDir!
  try {
    await lstat(join(current, ".git"));
    return current;
  } catch {
    /* continue */
  }

  try {
    await lstat(join(current, "package.json"));
    return current;
  } catch {
    /* continue */
  }

  try {
    await lstat(join(current, ".repograph"));
    return current;
  } catch {
    /* continue */
  }

  // 2. Otherwise walk up to find parent .git
  let walk = current;
  while (true) {
    const parent = resolve(walk, "..");
    if (parent === walk) {
      return current;
    }
    try {
      await lstat(join(parent, ".git"));
      return parent;
    } catch {
      walk = parent;
    }
  }
}

export function languageForPath(path: string): SourceLanguage {
  return LANGUAGE_BY_EXTENSION[extname(path).toLowerCase()] ?? null;
}

export async function scanRepository(options: ScanOptions): Promise<RepositoryFile[]> {
  const rootDir = resolve(options.rootDir);
  const maxFileSizeBytes = options.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE;
  const matcher = await buildIgnoreMatcher(rootDir, options.ignorePatterns ?? []);
  const results: RepositoryFile[] = [];

  await walk(rootDir, rootDir, matcher, maxFileSizeBytes, results);
  return results.sort((left, right) => left.path.localeCompare(right.path));
}

async function buildIgnoreMatcher(rootDir: string, patterns: string[]): Promise<Ignore> {
  const matcher = ignore();
  matcher.add([...IGNORED_DIRECTORIES].map((directory) => `${directory}/`));

  try {
    const gitignore = await readFile(join(rootDir, ".gitignore"), "utf8");
    matcher.add(gitignore);
  } catch {
    // A repository does not need a .gitignore to be indexable.
  }

  matcher.add(patterns);
  return matcher;
}

async function walk(
  rootDir: string,
  currentDir: string,
  matcher: Ignore,
  maxFileSizeBytes: number,
  results: RepositoryFile[],
): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      continue;
    }

    const absolutePath = join(currentDir, entry.name);
    const relativePath = toPortablePath(relative(rootDir, absolutePath));
    if (!relativePath || matcher.ignores(`${relativePath}${entry.isDirectory() ? "/" : ""}`)) {
      continue;
    }

    if (entry.isDirectory()) {
      await walk(rootDir, absolutePath, matcher, maxFileSizeBytes, results);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const stats = await lstat(absolutePath);
    const isTooLarge = stats.size > maxFileSizeBytes;
    const isBinary = isTooLarge ? false : await detectBinary(absolutePath);

    results.push({
      path: relativePath,
      absolutePath,
      size: stats.size,
      modifiedTimeMs: stats.mtimeMs,
      hash: isTooLarge ? "" : await hashFile(absolutePath),
      language: languageForPath(relativePath),
      isBinary,
      isTooLarge,
    });
  }
}

async function detectBinary(path: string): Promise<boolean> {
  const sample = await readFile(path).then((buffer) => buffer.subarray(0, 8192));
  return sample.includes(0);
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolvePromise, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk: string | Buffer) => hash.update(chunk));
    stream.on("end", () => resolvePromise());
    stream.on("error", reject);
  });
  return hash.digest("hex");
}

function toPortablePath(path: string): string {
  return path.split(sep).join("/");
}

export function isIndexableSource(file: RepositoryFile): boolean {
  return file.language !== null && !file.isBinary && !file.isTooLarge;
}

export function isGeneratedPath(path: string): boolean {
  const name = basename(path).toLowerCase();
  return (
    name.endsWith(".generated.ts") ||
    name.endsWith(".gen.ts") ||
    path.includes("/generated/") ||
    path.includes("/__generated__/")
  );
}
