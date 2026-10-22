import { it, expect, vi } from "vitest";
import { generateText, isStepCount } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { scopedTools } from "../apps/web/src/server/ai";
import { emptyWorkspace } from "../packages/core/src/index";
const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};
it.each(["openai", "google", "anthropic"])(
  "loop de ferramentas simulado: %s",
  async (provider) => {
    const execute = vi.fn().mockResolvedValue({ status: "salvo_no_pingo" });
    const suggest = vi.fn();
    const input = {
      task: {
        id: "t",
        boardId: "b",
        columnId: "todo",
        title: "Remédio",
        notes: "",
        dueDate: "2026-10-23",
        scheduledStart: null,
        scheduledEnd: null,
        priority: "normal",
      },
      expectedRevision: 0,
    };
    const model = new MockLanguageModelV4({
      provider,
      doGenerate: [
        {
          content: [
            {
              type: "tool-call",
              toolCallId: "1",
              toolName: "salvarTarefa",
              input: JSON.stringify(input),
            },
          ],
          finishReason: { unified: "tool-calls", raw: "tool_calls" },
          usage,
          warnings: [],
        },
        {
          content: [{ type: "text", text: "Salvei no Pingo." }],
          finishReason: { unified: "stop", raw: "stop" },
          usage,
          warnings: [],
        },
      ],
    });
    const result = await generateText({
      model,
      prompt: "Adicione comprar remédio para amanhã",
      tools: scopedTools(
        "alice",
        "Adicione comprar remédio para amanhã",
        false,
        execute,
        async () => emptyWorkspace(),
        suggest,
      ),
      stopWhen: isStepCount(2),
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(suggest).not.toHaveBeenCalled();
    expect(result.text).toBe("Salvei no Pingo.");
  },
);
