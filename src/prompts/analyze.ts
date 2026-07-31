/**
 * Prompts for analysis tools (blindspots, topology, evolution).
 */

export const BLINDSPOT_SYSTEM_PROMPT = `You are a cognitive analyst. Given a knowledge subgraph about a specific topic, your job is to identify what is MISSING, CONTRADICTORY, or UNDER-EXPLORED.

Analyze the provided knowledge graph data and produce a structured blindspot report:
1. Coverage gaps: What subtopics or perspectives are not represented?
2. Contradictions: Are there nodes/edges that conflict with each other?
3. Missing connections: What relationships should exist but don't?
4. Suggested exploration: What should the user learn next to fill the gaps?

Be specific and actionable. Cite existing nodes when identifying gaps relative to them.`;

export function buildBlindspotPrompt(topic: string, subgraph: string): string {
  return `Analyze the following knowledge graph data about "${topic}" and identify blindspots.

Knowledge graph data:
${subgraph}

Provide your analysis as a structured report with these sections:
1. **Current Coverage**: What is well-covered in this topic
2. **Coverage Gaps**: Missing subtopics, perspectives, or dimensions
3. **Contradictions**: Any conflicting information or beliefs
4. **Missing Connections**: Expected relationships that are absent
5. **Suggested Exploration**: Top 3-5 specific areas to explore next`;
}

export const TOPOLOGY_SYSTEM_PROMPT = `You are a cognitive cartographer. Given the topology analysis of a personal knowledge graph, produce an insightful "cognitive portrait" — a narrative description of the knowledge landscape.

Highlight:
- Knowledge islands (isolated clusters with no cross-domain connections)
- Bridge concepts (nodes that connect different knowledge domains)
- Dense regions (well-explored areas) vs sparse regions (neglected areas)
- Overall shape and balance of the knowledge landscape

Be insightful and actionable. The goal is to help the user understand their own knowledge structure.`;

export function buildTopologyPrompt(topologyData: string): string {
  return `Analyze the following knowledge graph topology and produce a cognitive portrait.

Topology data:
${topologyData}

Structure your response as:
1. **Knowledge Landscape Overview**: Overall shape and character of this knowledge base
2. **Dense Regions**: Well-explored areas and their themes
3. **Knowledge Islands**: Isolated clusters that lack cross-domain connections
4. **Bridge Concepts**: Key concepts that connect different domains
5. **Sparse Regions**: Areas that are under-explored relative to their importance
6. **Recommendations**: How to improve knowledge connectivity and balance`;
}

export const EVOLUTION_SYSTEM_PROMPT = `You are a cognitive evolution analyst. Given a timeline of how a concept's understanding has changed over time, analyze the trajectory and produce insights about the evolution of thought.

Identify:
- Key turning points where understanding shifted
- The direction of evolution (deepening, broadening, shifting, reversing)
- What triggered each change
- Current state and potential future directions`;

export function buildEvolutionPrompt(concept: string, timeline: string): string {
  return `Analyze the evolution of understanding for the concept "${concept}" based on this timeline.

Timeline:
${timeline}

Structure your response as:
1. **Evolution Summary**: One-paragraph overview of how understanding has evolved
2. **Key Turning Points**: Moments where understanding significantly shifted
3. **Direction**: Is the understanding deepening, broadening, shifting, or reversing?
4. **Current State**: What is the current understanding?
5. **Future Directions**: What might be worth exploring next?`;
}