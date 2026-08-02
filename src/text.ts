/**
 * 文本处理工具。
 *
 * 关键词提取使用 Unicode 属性转义 (\p{L}/\p{N}) 匹配任意语言的字母与数字，
 * 避免 JS 的 \w 只匹配 [A-Za-z0-9_] 导致中文关键词被丢弃的问题。
 */

/**
 * 从文本中提取关键词（去重、保持出现顺序）。
 *
 * - "分布式系统与共识算法" → ["分布式系统与共识算法"]（连续中文整体匹配）
 * - "CAP theorem and Raft consensus" → ["CAP", "theorem", "and", "Raft", ...]
 * - 中英混合 "CAP 定理与 Raft" → ["CAP", "定理与", "Raft"]
 *
 * @param minLen      最小词长（默认 2，中文双字词可保留）
 * @param maxKeywords 最多返回多少个关键词
 */
export function extractKeywords(text: string, minLen = 2, maxKeywords = 20): string[] {
  const matches = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const word of matches) {
    if (word.length < minLen) continue;
    if (seen.has(word)) continue;
    seen.add(word);
    out.push(word);
    if (out.length >= maxKeywords) break;
  }
  return out;
}