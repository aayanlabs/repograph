import { watch } from "node:fs";
import { resolve } from "node:path";

import { RepositoryIndexer, defaultDatabasePath } from "./indexer.js";
import { findGitRoot } from "./scanner.js";
import type { IndexSummary } from "./types.js";

export interface WatcherOptions {
  rootDir: string;
  debounceMs?: number;
  onUpdate?: (summary: IndexSummary) => void;
  onError?: (error: unknown) => void;
}

export function watchRepository(options: WatcherOptions): { close: () => void } {
  const root = resolve(options.rootDir);
  const dbPath = defaultDatabasePath(root);
  const debounceMs = options.debounceMs ?? 300;

  let timer: NodeJS.Timeout | null = null;
  let isIndexing = false;
  let pendingRun = false;

  const triggerIndex = () => {
    if (isIndexing) {
      pendingRun = true;
      return;
    }

    isIndexing = true;
    pendingRun = false;

    findGitRoot(root)
      .then((gitRoot: string) => {
        const indexer = new RepositoryIndexer(dbPath);
        return indexer.index({ rootDir: gitRoot, databasePath: dbPath }).finally(() => {
          indexer.store.close();
        });
      })
      .then((summary: IndexSummary) => {
        if (summary.indexedFiles > 0 || summary.removedFiles > 0) {
          options.onUpdate?.(summary);
        }
      })
      .catch((error: unknown) => {
        options.onError?.(error);
      })
      .finally(() => {
        isIndexing = false;
        if (pendingRun) {
          triggerIndex();
        }
      });
  };

  const scheduleRun = () => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(triggerIndex, debounceMs);
  };

  const watcher = watch(root, { recursive: true }, () => {
    scheduleRun();
  });

  return {
    close() {
      if (timer) {
        clearTimeout(timer);
      }
      watcher.close();
    },
  };
}
