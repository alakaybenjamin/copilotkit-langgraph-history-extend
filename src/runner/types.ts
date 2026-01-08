import type { LangGraphAgent } from "@copilotkit/runtime/langgraph";
import type { AgentRunnerRunRequest } from "@copilotkitnext/runtime";

/**
 * Configuration for the HistoryHydratingAgentRunner.
 *
 * Two modes of operation:
 * 1. LangGraph Platform/Cloud: Provide deploymentUrl and graphId
 * 2. Self-hosted (FastAPI): Provide client implementing HistoryClientInterface
 *
 * When using a custom client, deploymentUrl and graphId are still required
 * for agent creation (the run() operation).
 */
export interface HistoryHydratingRunnerConfig {
  /**
   * The LangGraphAgent instance to delegate run() calls to.
   */
  agent: LangGraphAgent;

  /**
   * LangGraph deployment URL.
   * Required for LangGraph Platform/Cloud.
   * Also required when using custom client (for agent creation).
   */
  deploymentUrl?: string;

  /**
   * Graph ID for the agent.
   * Required for LangGraph Platform/Cloud.
   * Also required when using custom client (for agent creation).
   */
  graphId?: string;

  /**
   * Custom client for history operations.
   * When provided, uses this instead of creating LangGraph SDK clients.
   * Useful for self-hosted FastAPI servers that implement the AG-UI protocol.
   */
  client?: HistoryClientInterface;

  /**
   * LangSmith API key for authentication (optional).
   */
  langsmithApiKey?: string;

  /**
   * Maximum number of history checkpoints to fetch.
   * Default: 100, Maximum: 1000 (LangGraph API limit)
   */
  historyLimit?: number;

  /**
   * Client timeout in milliseconds.
   * Default: 1800000 (30 minutes) - supports long-running agents.
   */
  clientTimeoutMs?: number;

  /**
   * Enable debug logging.
   * Default: false
   */
  debug?: boolean;

  /**
   * Optional function to extract additional state from the request.
   * Called during run() to enrich the state passed to the agent.
   *
   * @param input - The run request input
   * @param forwardedProps - Optional forwarded props from CopilotKit
   * @returns State object to merge with existing state
   */
  stateExtractor?: StateExtractor;
}

/**
 * Function type for extracting state from run requests.
 */
export type StateExtractor = (
  input: AgentRunnerRunRequest["input"],
  forwardedProps?: Record<string, unknown>
) => Record<string, unknown>;

/**
 * LangGraph message format from thread state.
 */
export interface LangGraphMessage {
  id: string;
  type: "human" | "ai" | "tool" | "system";
  content: string | Array<{ type: string; text?: string }>;
  tool_calls?: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }>;
  tool_call_id?: string;
}

/**
 * Thread state from LangGraph checkpoint.
 */
export interface ThreadState {
  values: {
    messages?: LangGraphMessage[];
    [key: string]: unknown;
  };
  next: string[];
  config?: unknown;
  created_at?: string;
  parent_config?: unknown;
  tasks?: Array<{
    id: string;
    name: string;
    interrupts?: Array<{
      value?: unknown;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  }>;
  checkpoint: unknown;
  metadata: unknown;
  parent_checkpoint?: unknown;
}

/**
 * Tool used to predict state (for intermediate state emission).
 */
export interface PredictStateTool {
  tool: string;
  state_key: string;
  tool_argument: string;
}

/**
 * Frozen agent config to prevent shared state contamination.
 */
export interface FrozenAgentConfig {
  deploymentUrl: string;
  graphId: string;
  langsmithApiKey?: string;
  clientTimeoutMs: number;
}

// =============================================================================
// Custom Client Interface (for self-hosted FastAPI servers)
// =============================================================================

/**
 * Interface for custom history clients.
 *
 * Implement this interface to provide history operations for self-hosted
 * LangGraph servers (e.g., FastAPI with AG-UI protocol).
 *
 * @example
 * ```typescript
 * const customClient: HistoryClientInterface = {
 *   threads: {
 *     getHistory: async (threadId, options) => {
 *       const res = await fetch(`${baseUrl}/threads/${threadId}/history?limit=${options?.limit}`);
 *       return res.json();
 *     },
 *     getState: async (threadId) => {
 *       const res = await fetch(`${baseUrl}/threads/${threadId}/state`);
 *       return res.json();
 *     },
 *   },
 *   runs: {
 *     list: async (threadId) => {
 *       const res = await fetch(`${baseUrl}/runs?thread_id=${threadId}`);
 *       return res.json();
 *     },
 *     joinStream: (threadId, runId, options) => {
 *       // Return async iterable for SSE stream
 *     },
 *   },
 * };
 * ```
 */
export interface HistoryClientInterface {
  threads: {
    /**
     * Get thread history (checkpoints).
     * @param threadId - The thread ID
     * @param options - Optional limit on number of checkpoints
     * @returns Array of thread states (checkpoints)
     */
    getHistory(
      threadId: string,
      options?: { limit?: number }
    ): Promise<ThreadState[]>;

    /**
     * Get current thread state.
     * @param threadId - The thread ID
     * @returns Current thread state
     */
    getState(threadId: string): Promise<ThreadState>;
  };

  runs: {
    /**
     * List runs for a thread.
     * @param threadId - The thread ID
     * @returns Array of runs
     */
    list(threadId: string): Promise<HistoryRun[]>;

    /**
     * Join an active run's stream.
     * @param threadId - The thread ID
     * @param runId - The run ID to join
     * @param options - Stream options
     * @returns Async iterable of stream chunks
     */
    joinStream(
      threadId: string,
      runId: string,
      options?: JoinStreamOptions
    ): AsyncIterable<HistoryStreamChunk>;
  };
}

/**
 * Run information from LangGraph.
 */
export interface HistoryRun {
  /** Unique run identifier */
  run_id: string;

  /** Current status of the run */
  status:
    | "running"
    | "pending"
    | "success"
    | "error"
    | "timeout"
    | "interrupted";

  /** Thread ID this run belongs to */
  thread_id?: string;

  /** Assistant/graph ID */
  assistant_id?: string;

  /** When the run was created */
  created_at?: string;

  /** When the run was last updated */
  updated_at?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Stream chunk from joinStream.
 */
export interface HistoryStreamChunk {
  /** Event type (e.g., "values", "updates", "events", "custom") */
  event: string;

  /** Event data payload */
  data: unknown;
}

/**
 * Options for joining a stream.
 */
export interface JoinStreamOptions {
  /**
   * Stream modes to subscribe to.
   * Common modes: "values", "updates", "events", "custom", "messages"
   */
  streamMode?: string[];
}
