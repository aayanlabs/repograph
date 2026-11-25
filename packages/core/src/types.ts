export type SourceLanguage =
  | "typescript"
  | "tsx"
  | "javascript"
  | "jsx"
  | "python"
  | "go"
  | "vue"
  | "svelte"
  | "json"
  | "html"
  | "css"
  | null;

export type NodeKind =
  | "file"
  | "directory"
  | "package"
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
  | "re_exports"
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

export interface ExportedSymbol {
  name: string;
  filePath: string;
  nodeId: string;
  kind: NodeKind;
  isExported: boolean;
  isDefault: boolean;
  signature?: string | null;
}

export interface NamedImport {
  specifier: string;
  importedName: string;
  localName: string;
  isDefault: boolean;
  line: number;
}

export interface UnresolvedCall {
  callerSymbolId?: string;
  callName: string;
  line: number;
  column: number;
}

export interface UnresolvedInheritance {
  childSymbolId: string;
  parentName: string;
  kind: "extends" | "implements";
}

export interface ParsedFile {
  symbols: GraphNode[];
  edges: GraphEdge[];
  imports: Array<{ specifier: string; line: number }>;
  namedImports?: NamedImport[];
  exportedSymbols?: ExportedSymbol[];
  unresolvedCalls?: UnresolvedCall[];
  unresolvedInheritance?: UnresolvedInheritance[];
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
  crossFileEdgesResolved?: number;
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

export interface ImpactNode {
  node: GraphNode;
  depth: number;
  reason: string;
  confidence: "static" | "inferred";
  via: string[];
}

export interface ImpactReport {
  target: GraphNode;
  directDependents: ImpactNode[];
  indirectDependents: ImpactNode[];
  totalAffected: number;
  depth: number;
  riskScore: "low" | "medium" | "high" | "critical";
  affectedFiles: string[];
}

export interface ModuleMetrics {
  filePath: string;
  fanIn: number;
  fanOut: number;
  instability: number;
  symbolCount: number;
  sizeBytes: number;
  language: SourceLanguage;
}

export type GraphVisualizationMode =
  "architecture" | "dependency" | "symbol" | "impact" | "codebase_map";

export interface ViewNodeData {
  id: string;
  kind: NodeKind;
  name: string;
  filePath: string;
  line?: number;
  signature?: string | null;
  size?: number;
  lang?: string;
  fanIn?: number;
  fanOut?: number;
  depth?: number;
  impactReason?: string;
  cluster?: string;
}

export interface ViewEdgeData {
  source: string;
  target: string;
  kind: EdgeKind;
  confidence?: "static" | "inferred";
}
