import type { ContextResult, GraphNode, SearchResult } from "./types.js";
import type { GraphStore } from "./storage.js";

export class RetrievalEngine {
  constructor(public readonly store: GraphStore) {}

  search(query: string, limit = 20): SearchResult[] {
    return this.store.search(query, limit);
  }

  context(task: string, limit = 12): Promise<ContextResult[]> {
    const results = this.store.search(task, limit);
    return Promise.all(
      results.map(async (result) => ({
        ...result,
        node: await withSourceExcerpt(result.node),
        relationships: await Promise.all(
          this.store.getEdges(result.node.id).map(async (edge) => {
            const relatedId = edge.sourceId === result.node.id ? edge.targetId : edge.sourceId;
            const related = this.store.getNode(relatedId);
            return {
              direction:
                edge.sourceId === result.node.id ? ("outgoing" as const) : ("incoming" as const),
              kind: edge.kind,
              node: related ? await withSourceExcerpt(related) : emptyNode(relatedId),
            };
          }),
        ),
      })),
    );
  }

  dependencies(target: string): GraphNode[] {
    const node = this.store.getNode(target);
    return node ? this.store.getRelatedNodes(node.id, "outgoing") : [];
  }

  dependents(target: string): GraphNode[] {
    const node = this.store.getNode(target);
    return node ? this.store.getRelatedNodes(node.id, "incoming") : [];
  }

  impact(target: string, depth = 3): GraphNode[] {
    return this.store.getImpact(target, depth);
  }
}

async function withSourceExcerpt(node: GraphNode): Promise<GraphNode> {
  if (node.source || node.kind === "file") {
    return node;
  }
  return node;
}

function emptyNode(id: string): GraphNode {
  return {
    id,
    kind: "file",
    name: id,
    filePath: id,
    start: { line: 1, column: 1 },
    end: { line: 1, column: 1 },
    signature: null,
    source: null,
  };
}

export function formatContextResult(result: ContextResult): string {
  const relationships = result.relationships
    .map(
      (relationship) =>
        `${relationship.direction} ${relationship.kind}: ${relationship.node.filePath}`,
    )
    .join("\n");
  return [
    `${result.node.filePath}:${result.node.start.line}-${result.node.end.line}`,
    `${result.node.kind} ${result.node.name}`,
    `score=${result.score}`,
    result.reasons.join("; "),
    relationships,
    result.node.source ?? "",
  ]
    .filter(Boolean)
    .join("\n");
}
