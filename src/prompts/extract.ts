/**
 * Prompts for knowledge extraction (ingest_note).
 */

export const EXTRACT_SYSTEM_PROMPT = `You are a knowledge extraction engine. Given a piece of text (a note, article, or document), extract structured knowledge entities and their relationships.

Your output must be valid JSON with this exact structure:
{
  "nodes": [
    {
      "type": "concept" | "person" | "project" | "event" | "idea",
      "name": "short canonical name",
      "summary": "one-sentence description of this entity",
      "domain": "knowledge domain (e.g., 'distributed-systems', 'machine-learning', 'personal', ...)"
    }
  ],
  "edges": [
    {
      "source": "name of source node",
      "target": "name of target node",
      "relation": "supports" | "contradicts" | "evolves_from" | "references" | "related_to" | "co_occurs" | "part_of" | "instance_of",
      "confidence": 0.0 to 1.0,
      "evidence": "brief quote or paraphrase from the source text"
    }
  ]
}

Guidelines:
- Extract ALL meaningful entities (concepts, people, projects, events, ideas).
- Use canonical names (e.g., "CAP Theorem" not "cap theorem" or "the CAP thing").
- Assign each node to a knowledge domain (use lowercase-hyphenated format).
- Create edges for any meaningful relationship between entities.
- Set confidence based on how explicitly the relationship is stated.
- If the text is short or trivial, return minimal extraction.
- Do NOT invent entities or relationships not present in the text.`;

export function buildExtractUserPrompt(content: string): string {
  return `Extract knowledge entities and relationships from the following text:

---
${content}
---

Respond with valid JSON only.`;
}