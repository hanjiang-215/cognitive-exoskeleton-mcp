/**
 * Prompts for association tools (connections, serendipity).
 */

export const CONNECTION_SYSTEM_PROMPT = `You are a creative connector. Given two knowledge entities that appear to be from different domains, find meaningful, non-obvious connections between them.

Your analysis should:
1. Identify structural or conceptual parallels
2. Suggest how insights from one domain might apply to the other
3. Propose a hypothesis or research direction that bridges them
4. Rate the creative potential of this connection (low/medium/high)

Be genuinely insightful — avoid superficial or forced connections.`;

export function buildConnectionPrompt(
  nodeA: string,
  nodeB: string,
  contextA: string,
  contextB: string,
  bridgeContext?: string,
): string {
  let prompt = `Analyze the potential connection between these two knowledge entities from different domains:

**Entity A**: ${nodeA}
Context: ${contextA}

**Entity B**: ${nodeB}
Context: ${contextB}`;

  if (bridgeContext) {
    prompt += `

**Bridge context** (they may be connected through): ${bridgeContext}`;
  }

  prompt += `

Provide your analysis:
1. **Structural Parallels**: What patterns are shared?
2. **Cross-domain Insight**: How might A inform B (or vice versa)?
3. **Creative Hypothesis**: A testable idea or research direction bridging them
4. **Creative Potential**: low / medium / high — and why`;

  return prompt;
}

export const SERENDIPITY_SYSTEM_PROMPT = `You are a serendipity engine. Your job is to find genuinely creative sparks between concepts from two different knowledge domains.

Given a pair of concepts from different domains, imagine what could happen if someone with expertise in both domains tried to combine their insights. Think about:
- Unexpected applications of one domain's methods to the other's problems
- Analogical reasoning that reveals new perspectives
- Novel combinations that neither domain has explored

Be bold but grounded. The goal is genuine creative inspiration, not random association.`;

export function buildSerendipityPrompt(
  domainA: string,
  domainB: string,
  nodeAName: string,
  nodeASummary: string,
  nodeBName: string,
  nodeBSummary: string,
): string {
  return `Spark a creative connection between these two concepts from different domains:

**Domain A** (${domainA}): ${nodeAName}
  ${nodeASummary}

**Domain B** (${domainB}): ${nodeBName}
  ${nodeBSummary}

Imagine a researcher or creator who deeply understands BOTH domains. What could they discover or create by combining insights from these two areas?

Provide:
1. **The Spark**: One sentence describing the creative connection
2. **The Bridge**: How do these concepts map onto each other?
3. **The Idea**: A concrete project, hypothesis, or innovation that emerges from this combination
4. **Why It Matters**: Why is this connection valuable or surprising?`;
}

export const QUERY_SYSTEM_PROMPT = `You are a second-brain assistant. You answer questions based on the user's personal knowledge graph. 

Use the provided knowledge graph context to answer the question. Cite specific nodes and their relationships when relevant. If the knowledge graph doesn't contain enough information, say so honestly and suggest what could be added.

Always ground your answer in the provided knowledge data. Do not fabricate information not present in the graph.`;

export function buildQueryPrompt(question: string, graphContext: string): string {
  return `Based on the following knowledge graph context, answer the user's question.

Knowledge graph context:
${graphContext}

Question: ${question}

Provide a clear, well-structured answer that cites the relevant knowledge entities and their relationships.`;
}