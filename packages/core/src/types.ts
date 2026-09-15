export type SourceLanguage = "typescript" | "tsx" | "javascript" | "jsx" | "python" | "go" | null;

export type NodeKind =
  | "file"
  | "directory"
  | "function"
  | "class"
  | "method"
  | "interface"
  | "type"
  | "variable"
  | "parameter"
  | "component"
  | "import"
  | "export";

export type EdgeKind =
  | "imports"
  | "exports"
  | "contains"
  | "calls"
  | "extends"
  | "implements"
  | "references"
  | "depends_on"
  | "renders"
  | "reads"
  | "writes"
  | "routes_to";

export interface SourcePosition {
  line: number;
  column: number;
}

export interface RepositoryFile {
  path: string;
  absolutePath: string;
  size: number;
  modifiedTimeMs: number;
  hash: string;
  language: SourceLanguage;
  isBinary: boolean;
  isTooLarge: boolean;
}

export interface GraphNode {
  id: string;
  kind: NodeKind;
  name: string;
  filePath: string;
  start: SourcePosition;
  end: SourcePosition;
  signature: string | null;
  source: string | null;
}

export interface GraphEdge {
  sourceId: string;
  targetId: string;
  kind: EdgeKind;
  metadata: Record<string, string> | null;
}

export interface ParsedFile {
  symbols: GraphNode[];
  edges: GraphEdge[];
  imports: Array<{ specifier: string; line: number }>;
  parseError: string | null;
}

export interface ScanOptions {
  rootDir: string;
  maxFileSizeBytes?: number;
  ignorePatterns?: string[];
}

export interface IndexOptions extends ScanOptions {
  databasePath?: string;
  force?: boolean;
}

export interface IndexSummary {
  rootDir: string;
  databasePath: string;
  scannedFiles: number;
  indexedFiles: number;
  skippedFiles: number;
  removedFiles: number;
  parseErrors: Array<{ path: string; message: string }>;
  durationMs: number;
}

export interface SearchResult {
  node: GraphNode;
  score: number;
  reasons: string[];
}

export interface ContextResult extends SearchResult {
  relationships: Array<{
    direction: "incoming" | "outgoing";
    kind: EdgeKind;
    node: GraphNode;
  }>;
}
