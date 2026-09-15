import { createRequire } from "node:module";

import { fileNodeId, symbolNodeId } from "./ids.js";
import type { GraphEdge, GraphNode, ParsedFile, RepositoryFile, SourcePosition } from "./types.js";

interface SyntaxNode {
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  namedChildren: SyntaxNode[];
  children: SyntaxNode[];
  hasError?(): boolean;
  childForFieldName(name: string): SyntaxNode | null;
}

interface SyntaxTree {
  rootNode: SyntaxNode;
}

interface SyntaxParser {
  setLanguage(language: unknown): void;
  parse(source: string): SyntaxTree;
}

type ParserConstructor = new () => SyntaxParser;
type LanguageModule = { typescript: unknown; tsx: unknown };

const require = createRequire(import.meta.url);
let Parser: ParserConstructor | null = null;
let JavaScript: unknown = null;
let TypeScript: LanguageModule | null = null;

try {
  Parser = require("tree-sitter") as ParserConstructor;
  JavaScript = require("tree-sitter-javascript") as unknown;
  TypeScript = require("tree-sitter-typescript") as LanguageModule;
} catch {
  // Tree-sitter optional native binary is missing; fallback regex parser will be used
}

export function parseSource(file: RepositoryFile, source: string): ParsedFile {
  if (file.language === "python" || file.language === "go" || !Parser) {
    return parseSourceRegex(file, source);
  }

  try {
    const parser = new Parser();
    parser.setLanguage(languageForFile(file));
    const tree = parser.parse(source);
    const symbols: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const imports: Array<{ specifier: string; line: number }> = [];
    const symbolByName = new Map<string, GraphNode>();
    const fileId = fileNodeId(file.path);

    walk(tree.rootNode, (node, parent) => {
      const line = positionFromNode(node);

      if (node.type.includes("import") || node.type.includes("export")) {
        const specifier = importSpecifier(node.text);
        if (specifier) {
          imports.push({ specifier, line: line.line });
        }
      }

      const extracted = extractSymbol(node, file, parent);
      if (node.type === "call_expression") {
        const calledName = callTargetName(node);
        const target = calledName ? symbolByName.get(calledName) : undefined;
        if (target) {
          edges.push({
            sourceId: currentEnclosingSymbolId(parent, file, symbolByName) ?? fileId,
            targetId: target.id,
            kind: "calls",
            metadata: null,
          });
        }
      }

      if (extracted && (extracted.kind === "class" || extracted.kind === "interface")) {
        const inheritance = extractInheritance(node, file, extracted, symbolByName);
        edges.push(...inheritance);
      }

      if (!extracted) {
        return;
      }

      symbols.push(extracted);
      if (!symbolByName.has(extracted.name)) {
        symbolByName.set(extracted.name, extracted);
      }
      edges.push({
        sourceId: fileId,
        targetId: extracted.id,
        kind: "contains",
        metadata: null,
      });

      if (parent && isSymbolNode(parent)) {
        edges.push({
          sourceId: parentSymbolId(parent, file, symbolByName),
          targetId: extracted.id,
          kind: "contains",
          metadata: null,
        });
      }
    });

    const rootHasError =
      typeof tree.rootNode.hasError === "function"
        ? (tree.rootNode.hasError as () => boolean)()
        : Boolean(tree.rootNode.hasError);

    return {
      symbols: deduplicateNodes(symbols),
      edges: deduplicateEdges(edges),
      imports: deduplicateImports(imports),
      parseError: rootHasError ? "Syntax errors detected" : null,
    };
  } catch {
    return parseSourceRegex(file, source);
  }
}

function languageForFile(file: RepositoryFile): unknown {
  if (!TypeScript || !JavaScript) {
    throw new Error("Tree-sitter module not loaded");
  }
  switch (file.language) {
    case "typescript":
      return TypeScript.typescript;
    case "tsx":
      return TypeScript.tsx;
    case "javascript":
    case "jsx":
      return JavaScript;
    default:
      throw new Error(`Unsupported parser language for ${file.path}`);
  }
}

function extractSymbol(
  node: SyntaxNode,
  file: RepositoryFile,
  parent: SyntaxNode | null,
): GraphNode | null {
  const kind = nodeKind(node.type, node.text);
  if (!kind) {
    return null;
  }

  const name = symbolName(node, parent);
  if (!name) {
    return null;
  }

  const start = positionFromNode(node);
  const end: SourcePosition = {
    line: node.endPosition.row + 1,
    column: node.endPosition.column + 1,
  };

  return {
    id: symbolNodeId(kind, file.path, name, start.line, start.column),
    kind,
    name,
    filePath: file.path,
    start,
    end,
    signature: (node.text.split("\n", 1)[0] ?? "").trim().slice(0, 500),
    source: node.text,
  };
}

function nodeKind(nodeType: string, text: string): GraphNode["kind"] | null {
  if (nodeType === "class_declaration" || nodeType === "abstract_class_declaration") {
    return "class";
  }
  if (nodeType === "interface_declaration") {
    return "interface";
  }
  if (nodeType === "type_alias_declaration") {
    return "type";
  }
  if (
    nodeType === "function_declaration" ||
    nodeType === "function_expression" ||
    nodeType === "arrow_function" ||
    nodeType === "generator_function_declaration"
  ) {
    return /^[A-Z]/.test(text.match(/(?:function\s+)?([A-Za-z_$][\w$]*)/)?.[1] ?? "")
      ? "component"
      : "function";
  }
  if (
    nodeType === "method_definition" ||
    nodeType === "method_signature" ||
    nodeType === "abstract_method_signature"
  ) {
    return "method";
  }
  if (nodeType === "lexical_declaration" || nodeType === "variable_declarator") {
    return "variable";
  }
  if (nodeType === "export_statement") {
    return null;
  }
  return null;
}

function symbolName(node: SyntaxNode, parent: SyntaxNode | null): string | null {
  const nameNode =
    node.childForFieldName("name") ??
    (node.type === "variable_declarator" ? node.childForFieldName("name") : null);
  if (nameNode?.text) {
    return nameNode.text;
  }

  if (
    node.type === "function_expression" ||
    node.type === "arrow_function" ||
    node.type === "variable_declarator"
  ) {
    return parent?.childForFieldName("name")?.text ?? null;
  }

  if (node.type === "export_statement") {
    const declaration = node.namedChildren.find((child) => nodeKind(child.type, child.text));
    return declaration ? symbolName(declaration, node) : null;
  }

  return null;
}

function importSpecifier(text: string): string | null {
  const match =
    text.match(/\bfrom\s+["']([^"']+)["']/) ?? text.match(/^\s*import\s*["']([^"']+)["']/);
  return match?.[1] ?? null;
}

function extractInheritance(
  node: SyntaxNode,
  file: RepositoryFile,
  sourceSymbol: GraphNode,
  symbolByName: Map<string, GraphNode>,
): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const text = node.text;

  const extendsMatch = text.match(/\bextends\s+([A-Za-z_$][\w$]*)/);
  if (extendsMatch?.[1]) {
    const targetName = extendsMatch[1];
    const target = symbolByName.get(targetName);
    if (target) {
      edges.push({
        sourceId: sourceSymbol.id,
        targetId: target.id,
        kind: "extends",
        metadata: null,
      });
    }
  }

  const implementsMatch = text.match(/\bimplements\s+([A-Za-z_$][\w$]*)/);
  if (implementsMatch?.[1]) {
    const targetName = implementsMatch[1];
    const target = symbolByName.get(targetName);
    if (target) {
      edges.push({
        sourceId: sourceSymbol.id,
        targetId: target.id,
        kind: "implements",
        metadata: null,
      });
    }
  }

  return edges;
}

function callTargetName(node: SyntaxNode): string | null {
  return node.childForFieldName("function")?.text?.split(".").pop() ?? null;
}

function positionFromNode(node: SyntaxNode): SourcePosition {
  return {
    line: node.startPosition.row + 1,
    column: node.startPosition.column + 1,
  };
}

function isSymbolNode(node: SyntaxNode): boolean {
  return nodeKind(node.type, node.text) !== null;
}

function parentSymbolId(
  node: SyntaxNode,
  file: RepositoryFile,
  symbolByName: Map<string, GraphNode>,
): string {
  const name = symbolName(node, null);
  const existing = name ? symbolByName.get(name) : undefined;
  if (existing) {
    return existing.id;
  }
  return symbolNodeId(
    nodeKind(node.type, node.text) ?? "function",
    file.path,
    name ?? node.type,
    node.startPosition.row + 1,
    node.startPosition.column + 1,
  );
}

function currentEnclosingSymbolId(
  node: SyntaxNode | null,
  file: RepositoryFile,
  symbolByName: Map<string, GraphNode>,
): string | null {
  if (!node) {
    return null;
  }
  if (isSymbolNode(node)) {
    return parentSymbolId(node, file, symbolByName);
  }
  return null;
}

function walk(
  node: SyntaxNode,
  visitor: (node: SyntaxNode, parent: SyntaxNode | null) => void,
  parent: SyntaxNode | null = null,
): void {
  visitor(node, parent);
  for (const child of node.namedChildren) {
    walk(child, visitor, node);
  }
}

function deduplicateNodes(nodes: GraphNode[]): GraphNode[] {
  return [...new Map(nodes.map((node) => [node.id, node])).values()];
}

function deduplicateEdges(edges: GraphEdge[]): GraphEdge[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = `${edge.sourceId}\0${edge.targetId}\0${edge.kind}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function deduplicateImports(
  imports: Array<{ specifier: string; line: number }>,
): Array<{ specifier: string; line: number }> {
  const seen = new Set<string>();
  return imports.filter((imp) => {
    if (seen.has(imp.specifier)) {
      return false;
    }
    seen.add(imp.specifier);
    return true;
  });
}

/* -------------------------------------------------------------------------- */
/*  Regex-based fallback parser for Python and Go                              */
/* -------------------------------------------------------------------------- */

const PYTHON_PATTERNS: Array<{ regex: RegExp; kind: GraphNode["kind"] }> = [
  { regex: /^class\s+([A-Za-z_]\w*)\s*[:(]/gm, kind: "class" },
  { regex: /^def\s+([A-Za-z_]\w*)\s*\(/gm, kind: "function" },
  { regex: /^ {4}def\s+([A-Za-z_]\w*)\s*\(/gm, kind: "method" },
  { regex: /^([A-Z_][A-Z0-9_]*)\s*=/gm, kind: "variable" },
];

const PYTHON_IMPORT_PATTERNS = [/^\s*import\s+(\S+)/gm, /^\s*from\s+(\S+)\s+import/gm];

const GO_PATTERNS: Array<{ regex: RegExp; kind: GraphNode["kind"] }> = [
  { regex: /^func\s+([A-Za-z_]\w*)\s*\(/gm, kind: "function" },
  { regex: /^func\s+\([^)]+\)\s+([A-Za-z_]\w*)\s*\(/gm, kind: "method" },
  { regex: /^type\s+([A-Za-z_]\w*)\s+struct\b/gm, kind: "class" },
  { regex: /^type\s+([A-Za-z_]\w*)\s+interface\b/gm, kind: "interface" },
  { regex: /^type\s+([A-Za-z_]\w*)\s+/gm, kind: "type" },
  { regex: /^var\s+([A-Za-z_]\w*)\s+/gm, kind: "variable" },
];

const JS_TS_PATTERNS: Array<{ regex: RegExp; kind: GraphNode["kind"] }> = [
  { regex: /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm, kind: "function" },
  { regex: /^(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/gm, kind: "class" },
  { regex: /^(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/gm, kind: "interface" },
  { regex: /^(?:export\s+)?type\s+([A-Za-z_$][\w$]*)/gm, kind: "type" },
  { regex: /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm, kind: "variable" },
];

const GO_IMPORT_PATTERN = /^\s*"([^"]+)"/gm;
const JS_TS_IMPORT_PATTERN = /\bfrom\s+["']([^"']+)["']/g;

function parseSourceRegex(file: RepositoryFile, source: string): ParsedFile {
  const symbols: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const imports: Array<{ specifier: string; line: number }> = [];
  const fileId = fileNodeId(file.path);

  const isPython = file.language === "python";
  const isGo = file.language === "go";
  const patterns = isPython ? PYTHON_PATTERNS : isGo ? GO_PATTERNS : JS_TS_PATTERNS;

  // Extract symbols
  for (const { regex, kind } of patterns) {
    // Reset regex state for each use
    const pattern = new RegExp(regex.source, regex.flags);
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      const name = match[1];
      if (!name) continue;
      const lineNumber = source.substring(0, match.index).split("\n").length;
      const col = match.index - (source.lastIndexOf("\n", match.index - 1) + 1) + 1;
      const lineEnd = source.indexOf("\n", match.index);
      const signatureLine =
        lineEnd === -1 ? source.substring(match.index) : source.substring(match.index, lineEnd);

      const node: GraphNode = {
        id: symbolNodeId(kind, file.path, name, lineNumber, col),
        kind,
        name,
        filePath: file.path,
        start: { line: lineNumber, column: col },
        end: { line: lineNumber, column: col + (match[0]?.length ?? 0) },
        signature: signatureLine.trim().slice(0, 500),
        source: null,
      };
      symbols.push(node);
      edges.push({
        sourceId: fileId,
        targetId: node.id,
        kind: "contains",
        metadata: null,
      });
    }
  }

  // Extract imports
  if (isPython) {
    for (const importPattern of PYTHON_IMPORT_PATTERNS) {
      const pattern = new RegExp(importPattern.source, importPattern.flags);
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source)) !== null) {
        const specifier = match[1];
        if (specifier) {
          const lineNumber = source.substring(0, match.index).split("\n").length;
          imports.push({ specifier, line: lineNumber });
        }
      }
    }
  } else if (isGo) {
    // Go: parse import block or single import lines
    const importBlockMatch = source.match(/import\s*\(([\s\S]*?)\)/);
    if (importBlockMatch?.[1]) {
      const blockStart = source.indexOf(importBlockMatch[0]);
      const blockStartLine = source.substring(0, blockStart).split("\n").length;
      const blockContent = importBlockMatch[1];
      const pattern = new RegExp(GO_IMPORT_PATTERN.source, GO_IMPORT_PATTERN.flags);
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(blockContent)) !== null) {
        const specifier = match[1];
        if (specifier) {
          const offsetLine = blockContent.substring(0, match.index).split("\n").length;
          imports.push({ specifier, line: blockStartLine + offsetLine - 1 });
        }
      }
    }
    // Also handle single-line: import "pkg"
    const singleImport = /^\s*import\s+"([^"]+)"/gm;
    let match: RegExpExecArray | null;
    while ((match = singleImport.exec(source)) !== null) {
      const specifier = match[1];
      if (specifier) {
        const lineNumber = source.substring(0, match.index).split("\n").length;
        imports.push({ specifier, line: lineNumber });
      }
    }
  } else {
    // JS/TS import parsing
    const pattern = new RegExp(JS_TS_IMPORT_PATTERN.source, JS_TS_IMPORT_PATTERN.flags);
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      const specifier = match[1];
      if (specifier) {
        const lineNumber = source.substring(0, match.index).split("\n").length;
        imports.push({ specifier, line: lineNumber });
      }
    }
  }

  // Extract class inheritance for Python
  if (isPython) {
    const classPattern = /^class\s+([A-Za-z_]\w*)\s*\(([^)]+)\)/gm;
    let match: RegExpExecArray | null;
    while ((match = classPattern.exec(source)) !== null) {
      const childName = match[1];
      const parentsStr = match[2];
      if (!childName || !parentsStr) continue;
      const childNode = symbols.find((s) => s.name === childName && s.kind === "class");
      if (!childNode) continue;
      const parentNames = parentsStr
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      for (const parentName of parentNames) {
        const cleanParent = parentName.split("(")[0]?.trim();
        if (!cleanParent || cleanParent === "object" || cleanParent === "ABC") continue;
        const parentNode = symbols.find((s) => s.name === cleanParent);
        if (parentNode) {
          edges.push({
            sourceId: childNode.id,
            targetId: parentNode.id,
            kind: "extends",
            metadata: null,
          });
        }
      }
    }
  }

  return {
    symbols: deduplicateNodes(symbols),
    edges: deduplicateEdges(edges),
    imports: deduplicateImports(imports),
    parseError: null,
  };
}
