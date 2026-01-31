/**
 * HistoryHydratingAgentRunner
 *
 * A custom AgentRunner that extends CopilotKit's base runner to add
 * message history hydration support for LangGraph threads.
 *
 * Fixes the issue where page refreshes don't load historical messages
 * by fetching thread state and emitting MESSAGES_SNAPSHOT events.
 */

import { type BaseEvent, EventType } from "@ag-ui/core";
import { LangGraphAgent } from "@copilotkit/runtime/langgraph";
import {
  AgentRunner,
  type AgentRunnerConnectRequest,
  type AgentRunnerRunRequest,
  type AgentRunnerStopRequest,
} from "@copilotkitnext/runtime";
import { Client, type StreamMode } from "@langchain/langgraph-sdk";
import { Observable } from "rxjs";

import {
  DEFAULT_HISTORY_LIMIT,
  DEFAULT_TIMEOUT,
  MAX_HISTORY_LIMIT,
} from "./constants";
import type {
  FrozenAgentConfig,
  HistoryClientInterface,
  HistoryHydratingRunnerConfig,
  HistoryRun,
  HistoryStreamChunk,
  LangGraphMessage,
  StateExtractor,
  ThreadState,
} from "./types";
import { createIsolatedAgent } from "../utils/create-isolated-agent";
import { transformMessages } from "../utils/message-transformer";
import { processStreamChunk, type StreamChunk } from "../utils/stream-processor";

/**
 * Custom AgentRunner that extends CopilotKit's base runner to add
 * message history hydration support for LangGraph threads.
 *
 * @example
 * ```typescript
 * import { HistoryHydratingAgentRunner, createIsolatedAgent } from 'copilotkit-langgraph-history';
 *
 * const agent = createIsolatedAgent({
 *   deploymentUrl: process.env.LANGGRAPH_DEPLOYMENT_URL!,
 *   graphId: "my-agent",
 *   langsmithApiKey: process.env.LANGSMITH_API_KEY,
 * });
 *
 * const runner = new HistoryHydratingAgentRunner({
 *   agent,
 *   deploymentUrl: process.env.LANGGRAPH_DEPLOYMENT_URL!,
 *   graphId: "my-agent",
 *   langsmithApiKey: process.env.LANGSMITH_API_KEY,
 *   historyLimit: 100,
 * });
 *
 * const runtime = new CopilotRuntime({
 *   agents: { "my-agent": agent },
 *   runner,
 * });
 * ```
 */
export class HistoryHydratingAgentRunner extends AgentRunner {
  private agent: LangGraphAgent;
  private historyLimit: number;
  private debug: boolean;
  private stateExtractor?: StateExtractor;
  private activeRun: {
    manuallyEmittedState?: Record<string, unknown>;
  } = {};

  /**
   * Custom client for history operations.
   * When provided, this is used instead of creating LangGraph SDK clients.
   */
  private readonly customClient?: HistoryClientInterface;

  /**
   * Frozen agent config to prevent shared state contamination.
   * We store the raw config values and create fresh Agent/Client instances per request.
   * This is critical because Vercel serverless can bundle multiple routes together,
   * causing module-level state to leak between different agent configurations.
   * 
   * Only used when customClient is not provided.
   */
  private readonly frozenConfig: Readonly<FrozenAgentConfig> | null;

  constructor(config: HistoryHydratingRunnerConfig) {
    super();
    this.agent = config.agent;
    this.debug = config.debug ?? false;
    this.stateExtractor = config.stateExtractor;
    this.customClient = config.client;

    // LangGraph API has a maximum limit of 1000 for history endpoint
    this.historyLimit = Math.min(
      config.historyLimit ?? DEFAULT_HISTORY_LIMIT,
      MAX_HISTORY_LIMIT
    );

    // When using custom client, still require deploymentUrl and graphId for agent creation
    if (config.client) {
      this.log("Using custom client for history operations");
      
      // Even with custom client, we need deploymentUrl and graphId for run() operations
      if (!config.deploymentUrl) {
        throw new Error(
          "HistoryHydratingAgentRunner: deploymentUrl is required (even when using a custom client, for agent creation)"
        );
      }
      if (!config.graphId) {
        throw new Error(
          "HistoryHydratingAgentRunner: graphId is required (even when using a custom client, for agent creation)"
        );
      }
      
      // Freeze the config for agent creation
      this.frozenConfig = Object.freeze({
        deploymentUrl: config.deploymentUrl,
        graphId: config.graphId,
        langsmithApiKey: config.langsmithApiKey,
        clientTimeoutMs: config.clientTimeoutMs ?? DEFAULT_TIMEOUT,
      });
    } else {
      // Validate required fields when not using custom client
      if (!config.deploymentUrl) {
        throw new Error(
          "HistoryHydratingAgentRunner: deploymentUrl is required when not using a custom client"
        );
      }
      if (!config.graphId) {
        throw new Error(
          "HistoryHydratingAgentRunner: graphId is required when not using a custom client"
        );
      }

      // Freeze the config to prevent mutation
      this.frozenConfig = Object.freeze({
        deploymentUrl: config.deploymentUrl,
        graphId: config.graphId,
        langsmithApiKey: config.langsmithApiKey,
        clientTimeoutMs: config.clientTimeoutMs ?? DEFAULT_TIMEOUT,
      });
    }
  }

  /**
   * Creates a fresh LangGraphAgent instance using the frozen config.
   * 
   * CRITICAL: This prevents shared state contamination in Vercel serverless
   * environments (Fluid Compute). We cannot trust request.agent because
   * CopilotKit's clone() passes config by reference, not by value, and
   * Vercel can bundle multiple routes together causing module-level state
   * to leak between different agent configurations.
   * 
   * Uses our isolated agent creator which:
   * 1. Creates agent with fresh, frozen config
   * 2. Verifies the internal client has the correct URL
   * 3. Force-replaces the client if contamination is detected
   * 
   * Note: When using a custom client (self-hosted), this is only called
   * for LangGraph Platform deployments. Self-hosted servers use this.agent.
   */
  private createFreshAgent(): LangGraphAgent {
    if (!this.frozenConfig) {
      throw new Error(
        "Cannot create agent: frozenConfig is not available. " +
        "When using a custom client, you must still provide deploymentUrl and graphId for agent creation."
      );
    }
    return createIsolatedAgent({
      deploymentUrl: this.frozenConfig.deploymentUrl,
      graphId: this.frozenConfig.graphId,
      langsmithApiKey: this.frozenConfig.langsmithApiKey,
      clientTimeoutMs: this.frozenConfig.clientTimeoutMs,
    });
  }

  /**
   * Gets the client for history operations.
   * Returns the custom client if provided, otherwise creates a fresh LangGraph SDK client.
   * 
   * CRITICAL: When using SDK client (LangGraph Platform), we create a FRESH Client
   * instance per call to prevent shared state contamination in Vercel serverless
   * environments. The frozen config ensures the correct deployment URL is always used.
   */
  private getHistoryClient(): HistoryClientInterface {
    // If custom client is provided, use it (self-hosted FastAPI servers)
    if (this.customClient) {
      return this.customClient;
    }

    // CRITICAL: Create a fresh LangGraph SDK client per call to prevent
    // shared state contamination in Vercel serverless environments.
    if (!this.frozenConfig) {
      throw new Error(
        "Cannot create client: neither custom client nor frozenConfig is available"
      );
    }

    const sdkClient = new Client({
      apiUrl: this.frozenConfig.deploymentUrl,
      apiKey: this.frozenConfig.langsmithApiKey,
      timeoutMs: this.frozenConfig.clientTimeoutMs,
    });

    // Wrap SDK client to match HistoryClientInterface
    return this.wrapSdkClient(sdkClient);
  }

  /**
   * Wraps the LangGraph SDK Client to match HistoryClientInterface.
   * This allows us to use the same code path for both SDK and custom clients.
   */
  private wrapSdkClient(sdkClient: Client): HistoryClientInterface {
    return {
      threads: {
        getHistory: async (threadId: string, options?: { limit?: number }) => {
          const history = await sdkClient.threads.getHistory(threadId, options);
          return history as unknown as ThreadState[];
        },
        getState: async (threadId: string) => {
          const state = await sdkClient.threads.getState(threadId);
          return state as unknown as ThreadState;
        },
      },
      runs: {
        list: async (threadId: string) => {
          const runs = await sdkClient.runs.list(threadId);
          return runs as unknown as HistoryRun[];
        },
        joinStream: (
          threadId: string,
          runId: string,
          options?: { streamMode?: string[] }
        ) => {
          return sdkClient.runs.joinStream(threadId, runId, {
            streamMode: options?.streamMode as ("values" | "messages" | "updates" | "events" | "custom" | "messages-tuple" | "debug")[],
          }) as unknown as AsyncIterable<HistoryStreamChunk>;
        },
      },
    };
  }

  /**
   * Log a message if debug mode is enabled.
   */
  private log(message: string, ...args: unknown[]): void {
    if (this.debug) {
      console.log(`[HistoryHydratingRunner] ${message}`, ...args);
    }
  }

  /**
   * Log a warning.
   */
  private warn(message: string, ...args: unknown[]): void {
    console.warn(`[HistoryHydratingRunner] ${message}`, ...args);
  }

  /**
   * Log an error.
   */
  private error(message: string, ...args: unknown[]): void {
    console.error(`[HistoryHydratingRunner] ${message}`, ...args);
  }

  /**
   * Run the agent with the appropriate agent instance.
   * 
   * CRITICAL for LangGraph Platform/Cloud (no custom client):
   * We cannot trust request.agent (cloned by CopilotKit) because its internal
   * Client may have been corrupted by shared module state in Vercel serverless
   * environments. We create a completely fresh agent with our frozen config
   * to GUARANTEE the correct deployment URL is used.
   * 
   * For self-hosted FastAPI servers (custom client provided):
   * - Use the original agent passed in the config (LangGraphHttpAgent)
   * - The SDK agent won't work because self-hosted servers don't implement
   *   the full LangGraph Platform API (no /assistants/search, etc.)
   */
  run(request: AgentRunnerRunRequest) {
    // CRITICAL: For LangGraph Platform, create a fresh agent to bypass any
    // shared state contamination in Vercel serverless environments.
    // For self-hosted (custom client), use the original agent.
    const agentToUse = this.customClient ? this.agent : this.createFreshAgent();
    this.log(`Using ${this.customClient ? 'original agent (self-hosted)' : 'fresh SDK agent (LangGraph Platform)'}`);

    // Extract state values using the configured extractor or default passthrough
    const inputWithProps = request.input as typeof request.input & {
      forwardedProps?: { configurable?: Record<string, unknown> };
    };
    const forwardedProps = inputWithProps.forwardedProps;
    const existingState = (request.input.state || {}) as Record<string, unknown>;

    let enrichedState: Record<string, unknown>;

    if (this.stateExtractor) {
      // Use custom state extractor
      const extractedState = this.stateExtractor(request.input, forwardedProps);
      enrichedState = {
        ...existingState,
        ...extractedState,
      };
    } else {
      // Default: just pass through existing state
      enrichedState = existingState;
    }

    this.log("State extraction:", {
      hasStateExtractor: !!this.stateExtractor,
      hasForwardedProps: !!forwardedProps,
      hasState: !!request.input.state,
      threadId: request.input.threadId,
    });

    // CRITICAL: Set state on the fresh/original agent before running.
    // This ensures the agent has the state configured before the run starts.
    // For LangGraph Platform: this is on the fresh agent (not contaminated).
    // For self-hosted: this is on the original agent passed in config.
    agentToUse.setState(enrichedState);

    // Create modified input with state values injected
    // This ensures LangGraph starts with these values from the first message
    const inputWithState = {
      ...request.input,
      state: enrichedState,
    };

    return agentToUse.run(inputWithState);
  }

  /**
   * Delegate isRunning to the agent.
   */
  async isRunning(): Promise<boolean> {
    return this.agent.isRunning;
  }

  /**
   * Delegate stop to the agent.
   */
  async stop(_request: AgentRunnerStopRequest): Promise<boolean | undefined> {
    const result = this.agent.abortRun();
    return result !== undefined ? result : true;
  }

  /**
   * Override connect to add history hydration support.
   *
   * When reconnecting to a thread:
   * 1. Fetches ALL thread history (checkpoints) from LangGraph
   * 2. Extracts and deduplicates messages from all checkpoints
   * 3. Transforms historical messages to CopilotKit format
   * 4. Emits MESSAGES_SNAPSHOT and STATE_SNAPSHOT events
   * 5. Completes the observable
   */
  connect(request: AgentRunnerConnectRequest): Observable<BaseEvent> {
    const { threadId } = request;

    // Get the history client (custom or SDK-based).
    // CRITICAL: When using SDK client (LangGraph Platform), this creates a
    // FRESH Client instance per connect() call to prevent shared state
    // contamination in Vercel serverless environments.
    const client = this.getHistoryClient();

    return new Observable<BaseEvent>((subscriber) => {
      const hydrate = async () => {
        try {
          // Fetch ALL thread history (checkpoints) from LangGraph
          // Using fresh client to ensure correct URL
          const history = await client.threads.getHistory(threadId, {
            limit: this.historyLimit > 0 ? this.historyLimit : DEFAULT_HISTORY_LIMIT,
          });

          if (!history || history.length === 0) {
            this.warn(`No history found for thread ${threadId}`);
            // Still emit required events so frontend doesn't get empty response
            const fallbackRunId =
              "hydration_" + Math.random().toString(36).slice(2);
            subscriber.next({
              type: EventType.RUN_STARTED,
              timestamp: Date.now(),
              threadId,
              runId: fallbackRunId,
            } as BaseEvent);
            subscriber.next({
              type: EventType.MESSAGES_SNAPSHOT,
              messages: [],
              timestamp: Date.now(),
              threadId,
              runId: fallbackRunId,
            } as BaseEvent);
            subscriber.next({
              type: EventType.RUN_FINISHED,
              timestamp: Date.now(),
              threadId,
              runId: fallbackRunId,
            } as BaseEvent);
            subscriber.complete();
            return;
          }

          // Extract messages from all checkpoints
          // Checkpoints are returned newest-first, so we reverse to get chronological order
          const allMessages: LangGraphMessage[] = [];
          const seenMessageIds = new Set<string>();

          // Process checkpoints in reverse order (oldest to newest) to maintain chronological order
          for (const checkpoint of history.reverse()) {
            const state = checkpoint as unknown as ThreadState;
            if (state.values?.messages) {
              const messages = (state.values.messages ||
                []) as LangGraphMessage[];

              // Add messages we haven't seen yet (deduplicate by ID)
              for (const msg of messages) {
                if (!seenMessageIds.has(msg.id)) {
                  seenMessageIds.add(msg.id);
                  allMessages.push(msg);
                }
              }
            }
          }

          this.log(
            `Loaded ${allMessages.length} unique messages from ${history.length} checkpoints`
          );

          // Apply history limit if configured (after deduplication)
          const limitedMessages =
            this.historyLimit > 0
              ? allMessages.slice(-this.historyLimit)
              : allMessages;

          // Transform LangGraph messages to CopilotKit format
          const transformedMessages = transformMessages(limitedMessages, {
            debug: this.debug,
          });

          // Fetch runs to get the latest runId
          let runId: string;
          try {
            const runs = await client.runs.list(threadId);
            // Use the most recent run ID if available
            runId =
              runs && runs.length > 0
                ? runs[0]!.run_id
                : "hydration_" + Math.random().toString(36).slice(2);
          } catch (error) {
            this.warn("Failed to fetch runs, using generated ID:", error);
            runId = "hydration_" + Math.random().toString(36).slice(2);
          }

          // Emit RUN_STARTED event first - CopilotKit requires this as the first event
          subscriber.next({
            type: EventType.RUN_STARTED,
            timestamp: Date.now(),
            threadId,
            runId,
          } as BaseEvent);

          // Emit MESSAGES_SNAPSHOT event - this is what the frontend needs for hydration
          subscriber.next({
            type: EventType.MESSAGES_SNAPSHOT,
            messages: transformedMessages,
            timestamp: Date.now(),
            threadId,
            runId,
          } as BaseEvent);

          // Get the latest checkpoint state (first in original history, last after reverse)
          const latestState = history[
            history.length - 1
          ] as unknown as ThreadState;

          // Emit STATE_SNAPSHOT event with latest state values
          // This hydrates other state fields like searchTools, triggers, plan, etc.
          if (latestState.values) {
            subscriber.next({
              type: "STATE_SNAPSHOT" as unknown as typeof EventType.CUSTOM,
              snapshot: latestState.values,
              rawEvent: {
                id: runId,
                event: "values",
                data: latestState.values,
              },
              timestamp: Date.now(),
              threadId,
              runId,
            } as unknown as BaseEvent);
          }

          // Check for interrupts in tasks from the latest checkpoint
          const interruptedTask = latestState.tasks?.find(
            (task) => task.interrupts && task.interrupts.length > 0
          );

          if (
            interruptedTask &&
            interruptedTask.interrupts &&
            interruptedTask.interrupts.length > 0
          ) {
            const interrupt = interruptedTask.interrupts[0];
            const interruptValue = interrupt?.value;

            // Emit custom interrupt event
            subscriber.next({
              type: "CUSTOM" as unknown as typeof EventType.CUSTOM,
              name: "on_interrupt",
              value: JSON.stringify(interruptValue),
              rawEvent: {
                id: runId,
                value: interruptValue,
              },
              timestamp: Date.now(),
              threadId,
              runId,
            } as unknown as BaseEvent);
          }

          // Check if thread is busy and has an active run to join (from latest checkpoint)
          const isThreadBusy = latestState.next && latestState.next.length > 0;

          let activeRun: HistoryRun | undefined;
          if (isThreadBusy) {
            try {
              const runs = await client.runs.list(threadId);
              // Find the most recent active run
              activeRun = runs?.find(
                (run: HistoryRun) =>
                  run.status === "running" || run.status === "pending"
              );
            } catch (error) {
              this.warn("Failed to check for active runs:", error);
            }
          }

          // If there's an active run, join the stream
          if (activeRun) {
            this.log(`Joining active stream for run ${activeRun.run_id}`);
            try {
              await this.joinAndProcessStream(
                client,
                threadId,
                activeRun.run_id,
                subscriber
              );
            } catch (error) {
              this.error("Error joining stream:", error);
              // Continue to complete even if stream joining fails
            }
          } else {
            // No active run - emit RUN_FINISHED and complete
            subscriber.next({
              type: EventType.RUN_FINISHED,
              timestamp: Date.now(),
              threadId,
              runId,
            } as BaseEvent);
          }

          // Complete - history hydration done
          subscriber.complete();
        } catch (error) {
          this.error("Failed to hydrate history:", error);
          // Fall back: emit required events so frontend doesn't get empty response
          const fallbackRunId =
            "hydration_error_" + Math.random().toString(36).slice(2);
          subscriber.next({
            type: EventType.RUN_STARTED,
            timestamp: Date.now(),
            threadId,
            runId: fallbackRunId,
          } as BaseEvent);
          subscriber.next({
            type: EventType.MESSAGES_SNAPSHOT,
            messages: [],
            timestamp: Date.now(),
            threadId,
            runId: fallbackRunId,
          } as BaseEvent);
          subscriber.next({
            type: EventType.RUN_FINISHED,
            timestamp: Date.now(),
            threadId,
            runId: fallbackRunId,
          } as BaseEvent);
          subscriber.complete();
        }
      };

      hydrate();
    });
  }

  /**
   * Joins an active stream and processes its events.
   *
   * This method connects to an already-running LangGraph execution and
   * processes all incoming events, transforming them to BaseEvent format.
   *
   * Tracks started messages and tool calls to handle mid-stream joins where
   * we might receive CONTENT/END events without having seen START events.
   */
  private async joinAndProcessStream(
    client: HistoryClientInterface,
    threadId: string,
    runId: string,
    subscriber: {
      next: (event: BaseEvent) => void;
      complete: () => void;
      error: (err: unknown) => void;
    }
  ): Promise<void> {
    // Track which messages and tool calls we've started
    // to handle mid-stream joins
    const startedMessages = new Set<string>();
    const startedToolCalls = new Set<string>();

    try {
      // Join the stream with multiple stream modes to get comprehensive event coverage.
      // Using the client passed from connect() (custom or SDK-based).
      const stream = client.runs.joinStream(threadId, runId, {
        streamMode: ["events", "values", "updates", "custom"] as StreamMode[],
      });

      let currentRunId = runId;
      let manuallyEmittedState = this.activeRun.manuallyEmittedState;

      // Process each chunk from the stream
      for await (const chunk of stream) {
        try {
          const result = await processStreamChunk(chunk as StreamChunk, {
            threadId,
            runId: currentRunId,
            subscriber,
            startedMessages,
            startedToolCalls,
            debug: this.debug,
            manuallyEmittedState,
          });
          currentRunId = result.runId;
          manuallyEmittedState = result.manuallyEmittedState;
        } catch (chunkError) {
          this.error("Error processing stream chunk:", chunkError);
          // Continue processing other chunks even if one fails
        }
      }

      // Update active run state
      this.activeRun.manuallyEmittedState = manuallyEmittedState;

      // Stream completed - check for interrupts before finishing
      try {
        const state = await client.threads.getState(threadId);
        const threadState = state as unknown as ThreadState;

        // Check for interrupts in the final state
        const interruptedTask = threadState.tasks?.find(
          (task) => task.interrupts && task.interrupts.length > 0
        );

        if (
          interruptedTask &&
          interruptedTask.interrupts &&
          interruptedTask.interrupts.length > 0
        ) {
          const interrupt = interruptedTask.interrupts[0];
          const interruptValue = interrupt?.value;

          // Emit custom interrupt event
          subscriber.next({
            type: "CUSTOM" as unknown as typeof EventType.CUSTOM,
            name: "on_interrupt",
            value: JSON.stringify(interruptValue),
            rawEvent: {
              id: currentRunId,
              value: interruptValue,
            },
            timestamp: Date.now(),
            threadId,
            runId: currentRunId,
          } as unknown as BaseEvent);
        }
      } catch (stateError) {
        this.warn("Failed to check for interrupts after stream:", stateError);
      }

      // Stream completed - emit RUN_FINISHED
      subscriber.next({
        type: EventType.RUN_FINISHED,
        timestamp: Date.now(),
        threadId,
        runId: currentRunId,
      } as BaseEvent);
    } catch (error) {
      this.error("Error in joinAndProcessStream:", error);

      // Emit error event
      subscriber.next({
        type: EventType.RUN_FINISHED,
        timestamp: Date.now(),
        threadId,
        runId,
      } as BaseEvent);

      throw error;
    }
  }
}
