import { describe, it, expect } from "vitest";

/**
 * Integration test: real StateGraph + interrupt + Command({ resume }).
 * This test builds a minimal LangGraph with the new architecture:
 *   action → waitForHuman → finish
 * interrupt() lives ONLY in waitForHuman, NOT in action.
 * This proves side effects execute exactly once before the pause.
 */
describe("StateGraph interrupt/resume integration", () => {
  it("should pause on interrupt and resume with Command — side effect executes once", async () => {
    const { StateGraph, Annotation, Command, interrupt, messagesStateReducer } = await import("@langchain/langgraph");
    const { MemorySaver } = await import("@langchain/langgraph-checkpoint");
    const { HumanMessage } = await import("@langchain/core/messages");

    const callLog: string[] = [];

    const TestState = Annotation.Root({
      messages: Annotation<any[]>({
        reducer: messagesStateReducer,
        default: () => [],
      }),
      pendingPause: Annotation<{ type: string; toolName: string } | null>({
        reducer: (_, next) => next,
        default: () => null,
      }),
    });

    const actionNode = async (state: typeof TestState.State) => {
      callLog.push('action');
      return {
        messages: [],
        pendingPause: { type: 'lesson_step', toolName: 'test_tool' },
      };
    };

    const waitNode = async (state: typeof TestState.State) => {
      const answer = interrupt(state.pendingPause);
      callLog.push(`resume:${answer}`);
      return {
        messages: [new HumanMessage(String(answer))],
        pendingPause: null,
      };
    };

    const finishNode = async (state: typeof TestState.State) => {
      callLog.push('finish');
      return { messages: [] };
    };

    const graph = new StateGraph(TestState)
      .addNode("action", actionNode)
      .addNode("waitForHuman", waitNode)
      .addNode("finish", finishNode)
      .addEdge("__start__", "action")
      .addConditionalEdges("action", (s: any) => s.pendingPause ? "waitForHuman" : "finish", {
        waitForHuman: "waitForHuman",
        finish: "finish",
      })
      .addEdge("waitForHuman", "finish")
      .compile({ checkpointer: new MemorySaver() });

    const threadConfig = { configurable: { thread_id: "test-integration-2" } };

    // ── First invocation ──
    const stream1 = await graph.streamEvents(
      { messages: [] },
      { ...threadConfig, version: "v3" },
    );

    for await (const _ of stream1) {
      // consume events
    }

    expect(stream1.interrupted).toBe(true);
    // 'action' must appear exactly ONCE — side effect does NOT re-execute
    expect(callLog).toEqual(['action']);

    // ── Resume ──
    const stream2 = await graph.streamEvents(
      new Command({ resume: 'dalej' }),
      { ...threadConfig, version: "v3" },
    );

    for await (const _ of stream2) {
      // consume events
    }

    expect(stream2.interrupted).toBe(false);

    expect(callLog).toEqual([
      'action',
      'resume:dalej',
      'finish',
    ]);
  });
});

/**
 * Integration test: simulate a real lesson scenario with two tool calls.
 * The graph should execute only ONE didactic tool, skip the second,
 * set pendingPause, and pause. After resume, the skipped tool should
 * NOT execute either.
 */
describe("Lesson graph didactic tool limiting", () => {
  it("should execute only one didactic tool per turn and skip the rest", async () => {
    const { StateGraph, Annotation, Command, interrupt, messagesStateReducer } = await import("@langchain/langgraph");
    const { MemorySaver } = await import("@langchain/langgraph-checkpoint");
    const { AIMessage, HumanMessage, ToolMessage } = await import("@langchain/core/messages");

    const executeLog: string[] = [];
    let agentInvocationCount = 0;

    const LessonState = Annotation.Root({
      messages: Annotation<any[]>({
        reducer: messagesStateReducer,
        default: () => [],
      }),
      pendingPause: Annotation<{ type: string; toolName: string; payload?: unknown } | null>({
        reducer: (_, next) => next,
        default: () => null,
      }),
    });

    const LESSON_PAUSE_TOOLS = new Set(['show_interval', 'show_pattern']);

    // Simulate an agent that produces two tool calls on first invocation,
    // then no tool calls after resume (lesson step complete)
    const agentNode = async (state: typeof LessonState.State) => {
      agentInvocationCount++;
      if (agentInvocationCount === 1) {
        return {
          messages: [new AIMessage({
            content: '',
            tool_calls: [
              { name: 'show_interval', args: { rootNote: 'C', interval: '3' }, id: 'call_1' },
              { name: 'show_pattern', args: { patternType: 'scale', patternName: 'major', rootNote: 'C' }, id: 'call_2' },
            ],
          })],
        };
      }
      // After resume, agent produces no tool calls (lesson step complete)
      return {
        messages: [new AIMessage({ content: 'Dobra robota!' })],
      };
    };

    const toolsNode = async (state: typeof LessonState.State) => {
      const lastMsg = state.messages[state.messages.length - 1];
      if (!lastMsg?.tool_calls?.length) return { pendingPause: null };

      const results: any[] = [];
      let didacticExecuted = false;
      let pauseToolName: string | null = null;
      let pausePayload: unknown = null;

      for (const tc of lastMsg.tool_calls) {
        const isDidactic = LESSON_PAUSE_TOOLS.has(tc.name);

        if (isDidactic && didacticExecuted) {
          // Skip — create placeholder ToolMessage
          results.push(new ToolMessage({
            content: JSON.stringify({
              success: false,
              skipped: true,
              reason: 'Lesson paused after first didactic action.',
            }),
            tool_call_id: tc.id,
          }));
          continue;
        }

        // Execute
        executeLog.push(tc.name);
        results.push(new ToolMessage({
          content: JSON.stringify({ success: true, action: tc.name }),
          tool_call_id: tc.id,
        }));

        if (isDidactic) {
          didacticExecuted = true;
          pauseToolName = tc.name;
          pausePayload = tc.args;
        }
      }

      return {
        messages: results,
        pendingPause: pauseToolName
          ? { type: 'lesson_step', toolName: pauseToolName, payload: pausePayload }
          : null,
      };
    };

    const waitForHumanNode = async (state: typeof LessonState.State) => {
      const response = interrupt(state.pendingPause);
      return {
        messages: [new HumanMessage(String(response))],
        pendingPause: null,
      };
    };

    const graph = new StateGraph(LessonState)
      .addNode("agent", agentNode)
      .addNode("tools", toolsNode)
      .addNode("waitForHuman", waitForHumanNode)
      .addEdge("__start__", "agent")
      .addConditionalEdges("agent", (s: any) => {
        const last = s.messages[s.messages.length - 1];
        return last?.tool_calls?.length ? "tools" : "__end__";
      }, { tools: "tools", __end__: "__end__" })
      .addConditionalEdges("tools", (s: any) => s.pendingPause ? "waitForHuman" : "agent", {
        waitForHuman: "waitForHuman",
        agent: "agent",
      })
      .addEdge("waitForHuman", "agent")
      .compile({ checkpointer: new MemorySaver() });

    const threadConfig = { configurable: { thread_id: "test-didactic-limit-1" } };

    // ── First run: should execute show_interval, skip show_pattern, pause ──
    const stream1 = await graph.streamEvents(
      { messages: [] },
      { ...threadConfig, version: "v3" },
    );

    for await (const _ of stream1) {
      // consume
    }

    expect(stream1.interrupted).toBe(true);
    // Only show_interval should have executed
    expect(executeLog).toEqual(['show_interval']);

    // ── Resume with user response ──
    const stream2 = await graph.streamEvents(
      new Command({ resume: 'dlaczego?' }),
      { ...threadConfig, version: "v3" },
    );

    for await (const _ of stream2) {
      // consume
    }

    // After resume, show_interval should still have executed only once
    expect(executeLog).toEqual(['show_interval']);
    // The graph should have continued to agent node (which now produces no tool calls,
    // so the graph ends without interruption)
    expect(stream2.interrupted).toBe(false);
  });
});