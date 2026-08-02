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

/**
 * 估算抽取任务的输出 token 预算（按笔记字符数）。
 *
 * 依据：中文约 1 token/字、英文约 3.5 字符/token；实体/关系数量与笔记
 * 长度大致线性相关，输出预算留 2 倍余量。下限 4096 保证小笔记也有足够
 * 预算，上限 16384 匹配主流模型单次输出上限，避免超长文本申请过大预算。
 */
export function estimateExtractMaxTokens(textLength: number): number {
  const estimatedTokens = Math.ceil(textLength / 3.5);
  return Math.min(16384, Math.max(4096, estimatedTokens * 2 + 1024));
}