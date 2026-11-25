import { findCycles } from "./query.js";
import type { GraphStore } from "./storage.js";
import type { GraphNode, ImpactReport } from "./types.js";

export interface AiProviderConfig {
  provider?: "openai" | "anthropic" | "ollama" | "mock";
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  consentGiven?: boolean;
}

export interface AiCompletionOptions {
  temperature?: number;
  maxTokens?: number;
}

export interface AiProvider {
  readonly id: string;
  readonly name: string;
  complete(prompt: string, options?: AiCompletionOptions): Promise<string>;
}

export class MockAiProvider implements AiProvider {
  readonly id = "mock";
  readonly name = "Local Grounded Engine (Offline)";

  async complete(prompt: string): Promise<string> {
    if (prompt.includes("Explain the architecture")) {
      return (
        "### Architectural Assessment\n" +
        "This repository employs a modular structure with dedicated packages. Key hubs manage core state and traversal. " +
        "Decoupled interfaces ensure high cohesion and low cross-boundary coupling."
      );
    }
    if (prompt.includes("change impact") || prompt.includes("Risk Assessment")) {
      return (
        "### Change Impact Assessment\n" +
        "The selected modification carries manageable risk. Downstream consumers should verify contracts and run regression suites."
      );
    }
    return (
      "### Grounded Graph Analysis\n" +
      "Based on the repository symbol graph and call paths, relationships are verified through static analysis."
    );
  }
}

export class OpenAiCompatibleProvider implements AiProvider {
  readonly id = "openai";
  readonly name = "OpenAI-Compatible API";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.openai.com/v1",
    private readonly model = "gpt-4o-mini",
  ) {}

  async complete(prompt: string, options: AiCompletionOptions = {}): Promise<string> {
    const url = `${this.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 1500,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`OpenAI API error (${res.status}): ${errorText}`);
    }

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? "";
  }
}

export class AnthropicCompatibleProvider implements AiProvider {
  readonly id = "anthropic";
  readonly name = "Anthropic Claude API";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.anthropic.com/v1",
    private readonly model = "claude-3-5-sonnet-20241022",
  ) {}

  async complete(prompt: string, options: AiCompletionOptions = {}): Promise<string> {
    const url = `${this.baseUrl.replace(/\/+$/, "")}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: options.maxTokens ?? 1500,
        temperature: options.temperature ?? 0.2,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Anthropic API error (${res.status}): ${errorText}`);
    }

    const data = (await res.json()) as { content?: Array<{ text?: string }> };
    return data.content?.[0]?.text ?? "";
  }
}

export class OllamaProvider implements AiProvider {
  readonly id = "ollama";
  readonly name = "Local Ollama Engine";

  constructor(
    private readonly baseUrl = "http://localhost:11434",
    private readonly model = "llama3",
  ) {}

  async complete(prompt: string): Promise<string> {
    const url = `${this.baseUrl.replace(/\/+$/, "")}/api/generate`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Ollama error (${res.status}): ${errorText}`);
    }

    const data = (await res.json()) as { response?: string };
    return data.response ?? "";
  }
}

export function createAiProvider(config: AiProviderConfig = {}): AiProvider {
  const providerType =
    config.provider ??
    (process.env.REPOGRAPH_AI_PROVIDER as AiProviderConfig["provider"]) ??
    (process.env.ANTHROPIC_API_KEY
      ? "anthropic"
      : process.env.OPENAI_API_KEY
        ? "openai"
        : process.env.OLLAMA_HOST
          ? "ollama"
          : "mock");

  if (providerType === "anthropic") {
    const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      return new AnthropicCompatibleProvider(apiKey, config.baseUrl, config.model);
    }
  }

  if (providerType === "openai") {
    const apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
    if (apiKey) {
      return new OpenAiCompatibleProvider(apiKey, config.baseUrl, config.model);
    }
  }

  if (providerType === "ollama") {
    const baseUrl = config.baseUrl ?? process.env.OLLAMA_HOST ?? "http://localhost:11434";
    return new OllamaProvider(baseUrl, config.model ?? "llama3");
  }

  return new MockAiProvider();
}

/**
 * Generate a grounded architecture explanation based strictly on graph facts.
 */
export async function explainArchitecture(
  store: GraphStore,
  provider = createAiProvider(),
): Promise<string> {
  const stats = store.stats();
  const files = store.getFiles();
  const metrics = store.getModuleMetrics();
  const cycles = findCycles(store);

  // Top 5 highest afferent coupling (most imported/depended on)
  const topHubs = metrics
    .slice()
    .sort((a, b) => b.fanIn - a.fanIn)
    .slice(0, 5);

  const prompt = `
You are an expert software architect analyzing an indexed repository.
Analyze the following grounded facts extracted from the repository graph:

- Total Files: ${stats.files}
- Total Symbols: ${stats.nodes}
- Total Relationships: ${stats.edges}
- Circular Dependency Loops: ${cycles.length}
- Primary Modules & Coupling:
${topHubs.map((h) => `  * ${h.filePath}: Fan-In=${h.fanIn}, Fan-Out=${h.fanOut}, Instability=${h.instability}`).join("\n")}
- Sample File Paths:
${files.slice(0, 20).map((f) => `  * ${f.path} (${f.language})`).join("\n")}

Explain the architecture of this repository, identifying:
1. High-level architecture pattern and organization
2. Core architectural hubs and entry points
3. Potential coupling hotspots or architectural risks
4. Modularity and separation of concerns assessment
Be concise, grounded in these facts, and avoid speculation.
`.trim();

  return provider.complete(prompt);
}

/**
 * Explain the impact of changing a specific file or symbol.
 */
export async function explainImpact(
  store: GraphStore,
  target: string,
  depth = 3,
  provider = createAiProvider(),
): Promise<string> {
  const report: ImpactReport | null = store.getImpactReport(target, depth);
  if (!report) {
    return `Target '${target}' was not found in the repository graph.`;
  }

  const prompt = `
You are analyzing the change impact for a symbol or file in a software repository.
Target: ${report.target.kind} '${report.target.name}' in '${report.target.filePath}'
Traversed Depth: ${report.depth} hops
Risk Assessment: ${report.riskScore.toUpperCase()}
Total Downstream Affected: ${report.totalAffected} symbols/files

Direct Dependents:
${report.directDependents.slice(0, 8).map((d) => `  - ${d.node.kind} '${d.node.name}' in ${d.node.filePath}: ${d.reason}`).join("\n") || "  (None)"}

Indirect Dependents:
${report.indirectDependents.slice(0, 8).map((d) => `  - ${d.node.kind} '${d.node.name}' in ${d.node.filePath} [depth ${d.depth}]`).join("\n") || "  (None)"}

Affected Files:
${report.affectedFiles.join(", ") || "(None)"}

Explain the blast radius of modifying this element:
1. Why this change carries ${report.riskScore} risk
2. Specific failure modes or regression risks in downstream consumers
3. Recommended test cases and files to verify after editing
`.trim();

  return provider.complete(prompt);
}

/**
 * Natural language graph query interface.
 */
export async function queryGraphNaturalLanguage(
  store: GraphStore,
  query: string,
  provider = createAiProvider(),
): Promise<{ answer: string; nodes: GraphNode[]; facts: string[] }> {
  const normalized = query.toLowerCase();
  const facts: string[] = [];
  let matchingNodes: GraphNode[] = [];

  if (normalized.includes("circular") || normalized.includes("cycle")) {
    const cycles = findCycles(store);
    facts.push(`Found ${cycles.length} circular dependency loops.`);
    const answer =
      cycles.length === 0
        ? "No circular dependency loops were detected in the repository graph."
        : `Detected ${cycles.length} circular dependency loop(s):\n` +
          cycles.map((c, i) => `Loop ${i + 1}: ${c.cycle.map((n) => n.name).join(" -> ")}`).join("\n");
    return { answer, nodes: cycles.flatMap((c) => c.cycle), facts };
  }

  if (normalized.includes("coupled") || normalized.includes("coupling") || normalized.includes("hotspot")) {
    const metrics = store.getModuleMetrics().sort((a, b) => b.fanIn + b.fanOut - (a.fanIn + a.fanOut));
    const top = metrics.slice(0, 5);
    facts.push(`Calculated coupling metrics across ${metrics.length} modules.`);
    matchingNodes = top
      .map((m) => store.getNode(m.filePath))
      .filter((n): n is GraphNode => n !== null);
    const answer =
      "Top coupled modules identified in the repository:\n" +
      top
        .map(
          (m, i) =>
            `${i + 1}. ${m.filePath} (Fan-In: ${m.fanIn}, Fan-Out: ${m.fanOut}, Instability: ${m.instability})`,
        )
        .join("\n");
    return { answer, nodes: matchingNodes, facts };
  }

  // Lexical & degree-weighted search fallback
  const searchResults = store.search(query, 10);
  matchingNodes = searchResults.map((r) => r.node);
  facts.push(`Retrieved ${matchingNodes.length} candidate symbols via FTS5 index.`);

  const prompt = `
The user asked: "${query}"

Here are relevant symbols from the repository graph:
${matchingNodes.map((n) => `- ${n.kind} '${n.name}' in ${n.filePath}${n.signature ? ` (${n.signature})` : ""}`).join("\n")}

Provide a direct, factual answer addressing the user's question based on these graph results.
`.trim();

  const answer = await provider.complete(prompt);
  return { answer, nodes: matchingNodes, facts };
}
