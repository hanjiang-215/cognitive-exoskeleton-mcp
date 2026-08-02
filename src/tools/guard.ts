/**
 * 工具 handler 错误兜底包装器。
 *
 * 8 个 MCP 工具内部都会调用 LLM / DB，异常（网络错误、JSON 解析失败、
 * 客户端拒绝 sampling 请求等）如果直接冒泡到 MCP 层，用户只能看到
 * 晦涩的原始异常。guard 把这些异常转为用户可读的文本响应。
 */

type ToolResult = { content: Array<{ type: "text"; text: string }> };
type ToolHandler = (args: any) => Promise<ToolResult>;

export function guard(fn: ToolHandler): ToolHandler {
  return async (args) => {
    try {
      return await fn(args);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error: ${msg}` }] };
    }
  };
}