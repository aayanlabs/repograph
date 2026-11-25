import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, resolve } from "node:path";

import { fileNodeId } from "./ids.js";
import type {
  EdgeKind,
  ExportedSymbol,
  GraphEdge,
  GraphNode,
  ImpactNode,
  ImpactReport,
  ModuleMetrics,
  NodeKind,
  RepositoryFile,
  SearchResult,
} from "./types.js";

interface SqliteStatement<Row = unknown> {
  run(...parameters: unknown[]): unknown;
  get(...parameters: unknown[]): Row | undefined;
  all(...parameters: unknown[]): Row[];
}

interface FileRow {
  path: string;
  absolute_path: string;
  size: number;
  modified_time_ms: number;
  hash: string;
  language: RepositoryFile["language"];
  is_binary: number;
  is_too_large: number;
}

interface NodeRow {
  id: string;
  kind: GraphNode["kind"];
  name: string;
  file_path: string;
  start_line: number;
  start_column: number;
  end_line: number;
  end_column: number;
  signature: string | null;
  source: string | null;
}

interface EdgeRow {
  source_id: string;
  target_id: string;
  kind: EdgeKind;
  metadata: string | null;
}

interface SymbolIndexRow {
  name: string;
  file_path: string;
  node_id: string;
  kind: NodeKind;
  is_exported: number;
  is_default: number;
  signature: string | null;
}

export class GraphStore {
  private readonly database: DatabaseSync;

  constructor(databasePath: string) {
    mkdirSync(dirname(resolve(databasePath)), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.migrateSchema();
  }

  private migrateSchema(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const versionRow = this.prepare<{ version: number }>(
      "SELECT MAX(version) AS version FROM schema_version",
    ).get();
    const currentVersion = versionRow?.version ?? 0;

    if (currentVersion < 1) {
      this.database.exec(`
        CREATE TABLE IF NOT EXISTS files (
          path TEXT PRIMARY KEY,
          absolute_path TEXT NOT NULL,
          size INTEGER NOT NULL,
          modified_time_ms REAL NOT NULL,
          hash TEXT NOT NULL,
          language TEXT,
          is_binary INTEGER NOT NULL DEFAULT 0,
          is_too_large INTEGER NOT NULL DEFAULT 0,
          indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS nodes (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          name TEXT NOT NULL,
          file_path TEXT NOT NULL,
          start_line INTEGER NOT NULL,
          start_column INTEGER NOT NULL,
          end_line INTEGER NOT NULL,
          end_column INTEGER NOT NULL,
          signature TEXT,
          source TEXT,
          FOREIGN KEY (file_path) REFERENCES files(path) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS edges (
          source_id TEXT NOT NULL,
          target_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          metadata TEXT,
          PRIMARY KEY (source_id, target_id, kind),
          FOREIGN KEY (source_id) REFERENCES nodes(id) ON DELETE CASCADE,
          FOREIGN KEY (target_id) REFERENCES nodes(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
        CREATE INDEX IF NOT EXISTS idx_nodes_file ON nodes(file_path);
        CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
        CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
        CREATE INDEX IF NOT EXISTS idx_files_hash ON files(hash);
        CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
          id UNINDEXED,
          name,
          file_path,
          signature,
          source
        );
        INSERT INTO schema_version (version) VALUES (1);
      `);
    }

    if (currentVersion < 2) {
      this.database.exec(`
        CREATE TABLE IF NOT EXISTS symbols_index (
          name TEXT NOT NULL,
          file_path TEXT NOT NULL,
          node_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          is_exported INTEGER NOT NULL DEFAULT 0,
          is_default INTEGER NOT NULL DEFAULT 0,
          signature TEXT,
          PRIMARY KEY (name, file_path, node_id),
          FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_sym_name ON symbols_index(name);
        CREATE INDEX IF NOT EXISTS idx_sym_file ON symbols_index(file_path);
        CREATE INDEX IF NOT EXISTS idx_edges_kind ON edges(kind);
        CREATE INDEX IF NOT EXISTS idx_nodes_kind ON nodes(kind);
        INSERT INTO schema_version (version) VALUES (2);
      `);
    }
  }

  close(): void {
    this.database.close();
  }

  getFile(path: string): RepositoryFile | null {
    const row = this.prepare<FileRow>("SELECT * FROM files WHERE path = ?").get(path);
    return row ? fileFromRow(row) : null;
  }

  getFiles(): RepositoryFile[] {
    return this.prepare<FileRow>("SELECT * FROM files ORDER BY path").all().map(fileFromRow);
  }

  allNodes(): GraphNode[] {
    return this.prepare<NodeRow>("SELECT * FROM nodes ORDER BY file_path, start_line")
      .all()
      .map(nodeFromRow);
  }

  allEdges(): GraphEdge[] {
    return this.prepare<EdgeRow>("SELECT * FROM edges").all().map(edgeFromRow);
  }

  stats(): { files: number; nodes: number; edges: number } {
    const files = this.prepare<{ count: number }>("SELECT COUNT(*) AS count FROM files").get();
    const nodes = this.prepare<{ count: number }>("SELECT COUNT(*) AS count FROM nodes").get();
    const edges = this.prepare<{ count: number }>("SELECT COUNT(*) AS count FROM edges").get();
    return {
      files: files?.count ?? 0,
      nodes: nodes?.count ?? 0,
      edges: edges?.count ?? 0,
    };
  }

  upsertFile(file: RepositoryFile): void {
    this.prepare(
      `INSERT INTO files (path, absolute_path, size, modified_time_ms, hash, language, is_binary, is_too_large)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET
         absolute_path = excluded.absolute_path,
         size = excluded.size,
         modified_time_ms = excluded.modified_time_ms,
         hash = excluded.hash,
         language = excluded.language,
         is_binary = excluded.is_binary,
         is_too_large = excluded.is_too_large,
         indexed_at = CURRENT_TIMESTAMP`,
    ).run(
      file.path,
      file.absolutePath,
      file.size,
      file.modifiedTimeMs,
      file.hash,
      file.language,
      file.isBinary ? 1 : 0,
      file.isTooLarge ? 1 : 0,
    );

    this.prepare(
      `INSERT INTO nodes
        (id, kind, name, file_path, start_line, start_column, end_line, end_column, signature, source)
       VALUES (?, 'file', ?, ?, 1, 1, 1, 1, ?, NULL)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, file_path = excluded.file_path, signature = excluded.signature`,
    ).run(fileNodeId(file.path), file.path, file.path, file.path);
  }

  replaceFileGraph(
    file: RepositoryFile,
    nodes: GraphNode[],
    edges: GraphEdge[],
    imports: Array<{ targetPath: string; specifier: string }>,
  ): void {
    this.database.exec("BEGIN");
    try {
      this.upsertFile(file);
      this.prepare(
        `DELETE FROM edges
         WHERE source_id IN (SELECT id FROM nodes WHERE file_path = ?)`,
      ).run(file.path);
      this.prepare(
        `DELETE FROM nodes_fts
         WHERE id IN (SELECT id FROM nodes WHERE file_path = ?)`,
      ).run(file.path);
      this.prepare("DELETE FROM nodes WHERE file_path = ? AND kind != 'file'").run(file.path);
      this.prepare("DELETE FROM symbols_index WHERE file_path = ?").run(file.path);

      const insertNode = this.prepare(
        `INSERT INTO nodes
          (id, kind, name, file_path, start_line, start_column, end_line, end_column, signature, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const insertFts = this.prepare(
        "INSERT INTO nodes_fts (id, name, file_path, signature, source) VALUES (?, ?, ?, ?, ?)",
      );
      for (const node of nodes) {
        insertNode.run(
          node.id,
          node.kind,
          node.name,
          node.filePath,
          node.start.line,
          node.start.column,
          node.end.line,
          node.end.column,
          node.signature,
          node.source,
        );
        insertFts.run(node.id, node.name, node.filePath, node.signature, node.source);
      }

      const insertEdge = this.prepare(
        "INSERT OR IGNORE INTO edges (source_id, target_id, kind, metadata) VALUES (?, ?, ?, ?)",
      );
      for (const edge of edges) {
        if (this.getNode(edge.sourceId) && this.getNode(edge.targetId)) {
          insertEdge.run(edge.sourceId, edge.targetId, edge.kind, serializeMetadata(edge.metadata));
        }
      }
      for (const imported of imports) {
        if (!this.getFile(imported.targetPath)) {
          continue;
        }
        insertEdge.run(
          fileNodeId(file.path),
          fileNodeId(imported.targetPath),
          "imports",
          JSON.stringify({ specifier: imported.specifier }),
        );
      }
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  insertEdges(edges: GraphEdge[]): void {
    if (edges.length === 0) return;
    this.database.exec("BEGIN");
    try {
      const stmt = this.prepare(
        "INSERT OR IGNORE INTO edges (source_id, target_id, kind, metadata) VALUES (?, ?, ?, ?)",
      );
      for (const edge of edges) {
        if (this.getNode(edge.sourceId) && this.getNode(edge.targetId)) {
          stmt.run(edge.sourceId, edge.targetId, edge.kind, serializeMetadata(edge.metadata));
        }
      }
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  saveExportedSymbols(filePath: string, symbols: ExportedSymbol[]): void {
    this.prepare("DELETE FROM symbols_index WHERE file_path = ?").run(filePath);
    if (symbols.length === 0) return;

    this.database.exec("BEGIN");
    try {
      const stmt = this.prepare(
        `INSERT OR REPLACE INTO symbols_index (name, file_path, node_id, kind, is_exported, is_default, signature)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const sym of symbols) {
        stmt.run(
          sym.name,
          sym.filePath,
          sym.nodeId,
          sym.kind,
          sym.isExported ? 1 : 0,
          sym.isDefault ? 1 : 0,
          sym.signature ?? null,
        );
      }
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  findExportedSymbol(filePath: string, name: string): ExportedSymbol | null {
    const row = this.prepare<SymbolIndexRow>(
      "SELECT * FROM symbols_index WHERE file_path = ? AND name = ? LIMIT 1",
    ).get(filePath, name);
    return row ? symbolFromRow(row) : null;
  }

  findDefaultExport(filePath: string): ExportedSymbol | null {
    const row = this.prepare<SymbolIndexRow>(
      "SELECT * FROM symbols_index WHERE file_path = ? AND is_default = 1 LIMIT 1",
    ).get(filePath);
    return row ? symbolFromRow(row) : null;
  }

  getAllExportedSymbols(filePath?: string): ExportedSymbol[] {
    const rows = filePath
      ? this.prepare<SymbolIndexRow>("SELECT * FROM symbols_index WHERE file_path = ?").all(
          filePath,
        )
      : this.prepare<SymbolIndexRow>("SELECT * FROM symbols_index").all();
    return rows.map(symbolFromRow);
  }

  removeFile(path: string): void {
    this.prepare("DELETE FROM files WHERE path = ?").run(path);
  }

  search(query: string, limit = 20): SearchResult[] {
    const terms = tokenize(query);
    if (terms.length === 0) {
      return [];
    }

    const candidates = this.prepare<NodeRow>(
      `SELECT * FROM nodes
       WHERE kind != 'file'
         AND (lower(name) LIKE ? OR lower(file_path) LIKE ? OR lower(signature) LIKE ?)
       ORDER BY start_line
       LIMIT 500`,
    ).all(`%${terms[0]}%`, `%${terms[0]}%`, `%${terms[0]}%`);

    return candidates
      .map((row) => {
        const node = nodeFromRow(row);
        const result = scoreNode(node, terms);
        const degree = this.getDegreeCentrality(node.id);
        if (degree > 0) {
          result.score += degree * 15;
          result.reasons.push(`graph centrality boost (+${degree * 15})`);
        }
        return result;
      })
      .filter((result) => result.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }

  getDegreeCentrality(nodeId: string): number {
    const row = this.prepare<{ count: number }>(
      "SELECT COUNT(*) AS count FROM edges WHERE target_id = ?",
    ).get(nodeId);
    return row?.count ?? 0;
  }

  getNode(idOrPath: string): GraphNode | null {
    const row = this.prepare<NodeRow>(
      "SELECT * FROM nodes WHERE id = ? OR file_path = ? LIMIT 1",
    ).get(idOrPath, idOrPath);
    return row ? nodeFromRow(row) : null;
  }

  getEdges(nodeId: string, direction: "incoming" | "outgoing" | "both" = "both"): GraphEdge[] {
    const rows =
      direction === "outgoing"
        ? this.prepare<EdgeRow>("SELECT * FROM edges WHERE source_id = ?").all(nodeId)
        : direction === "incoming"
          ? this.prepare<EdgeRow>("SELECT * FROM edges WHERE target_id = ?").all(nodeId)
          : this.prepare<EdgeRow>("SELECT * FROM edges WHERE source_id = ? OR target_id = ?").all(
              nodeId,
              nodeId,
            );
    return rows.map(edgeFromRow);
  }

  getRelatedNodes(
    nodeId: string,
    direction: "incoming" | "outgoing" | "both" = "both",
  ): GraphNode[] {
    const edges = this.getEdges(nodeId, direction);
    const ids = edges.map((edge) => (edge.sourceId === nodeId ? edge.targetId : edge.sourceId));
    if (ids.length === 0) {
      return [];
    }
    const placeholders = ids.map(() => "?").join(", ");
    return this.prepare<NodeRow>(`SELECT * FROM nodes WHERE id IN (${placeholders})`)
      .all(...ids)
      .map(nodeFromRow);
  }

  getImpact(target: string, depth = 3): GraphNode[] {
    const report = this.getImpactReport(target, depth);
    if (!report) return [];
    return [...report.directDependents, ...report.indirectDependents].map((d) => d.node);
  }

  getImpactReport(target: string, depth = 3): ImpactReport | null {
    const node = this.getNode(target);
    if (!node) {
      return null;
    }

    const visited = new Set<string>([node.id]);
    const paths = new Map<string, string[]>([[node.id, [node.id]]]);
    const directDependents: ImpactNode[] = [];
    const indirectDependents: ImpactNode[] = [];
    const affectedFiles = new Set<string>();

    let frontier = [node.id];

    for (let level = 1; level <= depth && frontier.length > 0; level += 1) {
      const nextFrontier: string[] = [];
      for (const currId of frontier) {
        const currentPath = paths.get(currId) ?? [currId];
        const incomingEdges = this.getEdges(currId, "incoming");

        for (const edge of incomingEdges) {
          if (visited.has(edge.sourceId)) {
            continue;
          }
          visited.add(edge.sourceId);
          nextFrontier.push(edge.sourceId);

          const newPath = [...currentPath, edge.sourceId];
          paths.set(edge.sourceId, newPath);

          const depNode = this.getNode(edge.sourceId);
          if (depNode) {
            affectedFiles.add(depNode.filePath);
            const meta = edge.metadata ?? {};
            const confidence = (meta.confidence === "inferred" ? "inferred" : "static") as
              "static" | "inferred";
            const reason = `${depNode.kind} '${depNode.name}' ${edge.kind} ${node.name} (level ${level})`;

            const impactItem: ImpactNode = {
              node: depNode,
              depth: level,
              reason,
              confidence,
              via: newPath,
            };

            if (level === 1) {
              directDependents.push(impactItem);
            } else {
              indirectDependents.push(impactItem);
            }
          }
        }
      }
      frontier = nextFrontier;
    }

    const totalAffected = directDependents.length + indirectDependents.length;
    let riskScore: "low" | "medium" | "high" | "critical" = "low";
    if (totalAffected > 25 || affectedFiles.size > 10) {
      riskScore = "critical";
    } else if (totalAffected > 10 || affectedFiles.size > 4) {
      riskScore = "high";
    } else if (totalAffected > 3 || affectedFiles.size > 1) {
      riskScore = "medium";
    }

    return {
      target: node,
      directDependents,
      indirectDependents,
      totalAffected,
      depth,
      riskScore,
      affectedFiles: Array.from(affectedFiles),
    };
  }

  getModuleMetrics(filePath?: string): ModuleMetrics[] {
    const files = filePath
      ? [this.getFile(filePath)].filter((f): f is RepositoryFile => f !== null)
      : this.getFiles();

    if (files.length === 0) {
      return [];
    }

    const fanInRows = this.prepare<{ file_path: string; count: number }>(
      `
      SELECT target_node.file_path AS file_path, COUNT(DISTINCT e.source_id) AS count
      FROM edges e
      JOIN nodes target_node ON e.target_id = target_node.id
      JOIN nodes source_node ON e.source_id = source_node.id
      WHERE source_node.file_path != target_node.file_path
      GROUP BY target_node.file_path
    `,
    ).all();
    const fanInMap = new Map(fanInRows.map((r) => [r.file_path, r.count]));

    const fanOutRows = this.prepare<{ file_path: string; count: number }>(
      `
      SELECT source_node.file_path AS file_path, COUNT(DISTINCT e.target_id) AS count
      FROM edges e
      JOIN nodes source_node ON e.source_id = source_node.id
      JOIN nodes target_node ON e.target_id = target_node.id
      WHERE source_node.file_path != target_node.file_path
      GROUP BY source_node.file_path
    `,
    ).all();
    const fanOutMap = new Map(fanOutRows.map((r) => [r.file_path, r.count]));

    const symbolRows = this.prepare<{ file_path: string; count: number }>(
      `
      SELECT file_path, COUNT(*) AS count
      FROM nodes
      WHERE kind != 'file'
      GROUP BY file_path
    `,
    ).all();
    const symbolMap = new Map(symbolRows.map((r) => [r.file_path, r.count]));

    return files.map((file) => {
      const fanIn = fanInMap.get(file.path) ?? 0;
      const fanOut = fanOutMap.get(file.path) ?? 0;
      const instability =
        fanIn + fanOut === 0 ? 0 : Math.round((fanOut / (fanIn + fanOut)) * 100) / 100;

      return {
        filePath: file.path,
        fanIn,
        fanOut,
        instability,
        symbolCount: symbolMap.get(file.path) ?? 0,
        sizeBytes: file.size,
        language: file.language,
      };
    });
  }

  private prepare<Row = unknown>(statement: string): SqliteStatement<Row> {
    return this.database.prepare(statement) as unknown as SqliteStatement<Row>;
  }
}

function fileFromRow(row: FileRow): RepositoryFile {
  return {
    path: row.path,
    absolutePath: row.absolute_path,
    size: row.size,
    modifiedTimeMs: row.modified_time_ms,
    hash: row.hash,
    language: row.language,
    isBinary: row.is_binary === 1,
    isTooLarge: row.is_too_large === 1,
  };
}

function nodeFromRow(row: NodeRow): GraphNode {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    filePath: row.file_path,
    start: { line: row.start_line, column: row.start_column },
    end: { line: row.end_line, column: row.end_column },
    signature: row.signature,
    source: row.source,
  };
}

function edgeFromRow(row: EdgeRow): GraphEdge {
  return {
    sourceId: row.source_id,
    targetId: row.target_id,
    kind: row.kind,
    metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, string>) : null,
  };
}

function symbolFromRow(row: SymbolIndexRow): ExportedSymbol {
  return {
    name: row.name,
    filePath: row.file_path,
    nodeId: row.node_id,
    kind: row.kind,
    isExported: row.is_exported === 1,
    isDefault: row.is_default === 1,
    signature: row.signature,
  };
}

function serializeMetadata(metadata: Record<string, string> | null): string | null {
  return metadata ? JSON.stringify(metadata) : null;
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9_$]+/)
    .map((term) => term.trim())
    .filter(Boolean);
}

function scoreNode(node: GraphNode, terms: string[]): SearchResult {
  const name = node.name.toLowerCase();
  const path = node.filePath.toLowerCase();
  const signature = node.signature?.toLowerCase() ?? "";
  let score = 0;
  const reasons: string[] = [];

  for (const term of terms) {
    if (name === term) {
      score += 100;
      reasons.push(`exact symbol match: ${term}`);
    } else if (name.includes(term)) {
      score += 60;
      reasons.push(`symbol contains: ${term}`);
    }
    if (path.includes(term)) {
      score += 30;
      reasons.push(`path contains: ${term}`);
    }
    if (signature.includes(term)) {
      score += 10;
      reasons.push(`source signature contains: ${term}`);
    }
  }

  return { node, score, reasons };
}
