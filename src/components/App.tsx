/**
 * Main Interactive TUI Application
 */

import { Box, Text, useApp, useInput, useStdout } from 'ink';
import Spinner from 'ink-spinner';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SDKAssistantMessage, SDKResultMessage } from '../lib/agent.js';
import { streamQuery } from '../lib/agent.js';
import { renderSync } from '../lib/markdown.js';
import {
  AUTO_APPROVED_TOOLS,
  buildSystemPrompt,
  getEnvironmentContext,
  INTERACTIVE_TOOLS,
} from '../lib/prompt.js';
import { HelpOverlay } from './HelpOverlay.js';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ToolCall {
  name: string;
  input: string;
}

interface AppProps {
  initialPrompt?: string;
  model?: string;
}

/** Format tool input for display */
function formatToolInput(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'Read':
      return String(input.file_path ?? '');
    case 'Glob':
      return `${input.pattern}${input.path ? ` in ${input.path}` : ''}`;
    case 'Grep':
      return `"${input.pattern}"${input.path ? ` in ${input.path}` : ''}`;
    case 'Bash':
      return String(input.command ?? '').slice(0, 50);
    default:
      return JSON.stringify(input).slice(0, 40);
  }
}

export function App({ initialPrompt, model }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [stats, setStats] = useState<{ tokens: number; cost: number } | null>(null);

  const terminalHeight = stdout?.rows ?? 24;
  const terminalWidth = stdout?.columns ?? 80;
  const [showHelp, setShowHelp] = useState(false);
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Calculate available height for messages (minus header, input, status)
  const messageAreaHeight = terminalHeight - 6;

  // Get visible messages (simple tail - show last few)
  const visibleMessages = useMemo(() => {
    // Estimate: each message takes ~3 lines on average
    const maxMessages = Math.max(2, Math.floor(messageAreaHeight / 4));
    return messages.slice(-maxMessages);
  }, [messages, messageAreaHeight]);

  // Handle query submission
  const submitQuery = useCallback(
    async (prompt: string) => {
      if (!prompt.trim() || isLoading) return;

      setMessages(prev => [...prev, { role: 'user', content: prompt }]);
      setInputHistory(prev => [...prev, prompt]);
      setHistoryIndex(-1);
      setInput('');
      setIsLoading(true);
      setStreamingText('');
      setToolCalls([]);
      setStats(null);

      try {
        let fullText = '';
        const systemPrompt = buildSystemPrompt(await getEnvironmentContext());
        const opts: Parameters<typeof streamQuery>[1] = {
          systemPrompt,
          tools: INTERACTIVE_TOOLS,
          allowedTools: AUTO_APPROVED_TOOLS,
          permissionMode: 'default',
          includePartialMessages: true,
        };
        if (model) {
          opts.model = model;
        }

        for await (const message of streamQuery(prompt, opts)) {
          if (message.type === 'assistant') {
            const assistantMsg = message as SDKAssistantMessage;
            for (const block of assistantMsg.message.content) {
              // Handle tool calls
              if ('type' in block && block.type === 'tool_use') {
                const toolBlock = block as {
                  type: 'tool_use';
                  name: string;
                  input: Record<string, unknown>;
                };
                setToolCalls(prev => {
                  // Avoid duplicates
                  if (
                    prev.some(
                      t =>
                        t.name === toolBlock.name &&
                        t.input === formatToolInput(toolBlock.name, toolBlock.input)
                    )
                  ) {
                    return prev;
                  }
                  return [
                    ...prev,
                    {
                      name: toolBlock.name,
                      input: formatToolInput(toolBlock.name, toolBlock.input),
                    },
                  ];
                });
              }
              // Handle text
              if ('text' in block && block.text) {
                fullText = block.text;
                setStreamingText(fullText);
              }
            }
          }

          if (message.type === 'result') {
            const result = message as SDKResultMessage;
            setStats({
              tokens: result.usage.input_tokens + result.usage.output_tokens,
              cost: result.total_cost_usd,
            });
          }
        }

        setMessages(prev => [...prev, { role: 'assistant', content: fullText }]);
        setStreamingText('');
        setToolCalls([]);
      } catch (error) {
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, model]
  );

  useEffect(() => {
    if (initialPrompt) {
      void submitQuery(initialPrompt);
    }
  }, [initialPrompt, submitQuery]);

  useInput((ch, key) => {
    // Toggle help overlay
    if (ch === '?' && !isLoading) {
      setShowHelp(prev => !prev);
      return;
    }

    // Close help with escape
    if (showHelp) {
      if (key.escape || ch === '?') {
        setShowHelp(false);
      }
      return;
    }

    // Exit
    if (key.escape || (key.ctrl && ch === 'c')) {
      exit();
      return;
    }

    if (isLoading) return;

    // Clear conversation (Ctrl+L)
    if (key.ctrl && ch === 'l') {
      setMessages([]);
      setStats(null);
      return;
    }

    // Clear input (Ctrl+U)
    if (key.ctrl && ch === 'u') {
      setInput('');
      setHistoryIndex(-1);
      return;
    }

    // Input history navigation
    if (key.upArrow && inputHistory.length > 0) {
      const newIndex = historyIndex < inputHistory.length - 1 ? historyIndex + 1 : historyIndex;
      setHistoryIndex(newIndex);
      setInput(inputHistory[inputHistory.length - 1 - newIndex] ?? '');
      return;
    }

    if (key.downArrow) {
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(inputHistory[inputHistory.length - 1 - newIndex] ?? '');
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInput('');
      }
      return;
    }

    // Submit
    if (key.return) {
      void submitQuery(input);
    } else if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1));
    } else if (ch && !key.ctrl && !key.meta) {
      setInput(prev => prev + ch);
    }
  });

  // Render help overlay if active
  if (showHelp) {
    return <HelpOverlay width={terminalWidth} height={terminalHeight} />;
  }

  return (
    <Box flexDirection="column" height={terminalHeight}>
      {/* Header */}
      <Box paddingX={1} borderStyle="round" borderColor="magenta">
        <Text color="magenta" bold>
          q
        </Text>
        <Text color="gray"> · </Text>
        <Text color="gray">{model ?? 'sonnet'}</Text>
        <Box flexGrow={1} />
        {stats && (
          <Text color="gray" dimColor>
            {stats.tokens}t · ${stats.cost.toFixed(4)}
          </Text>
        )}
      </Box>

      {/* Messages area */}
      <Box flexDirection="column" flexGrow={1} paddingX={1} overflow="hidden">
        {visibleMessages.map((msg, i) => (
          <Box key={`${i}-${msg.role}`} flexDirection="row" marginTop={i > 0 ? 1 : 0}>
            <Text color={msg.role === 'user' ? 'cyan' : 'green'}>
              {msg.role === 'user' ? '› ' : '◆ '}
            </Text>
            <Box flexDirection="column" flexShrink={1} width={terminalWidth - 6}>
              <Text wrap="wrap">
                {msg.role === 'assistant' ? renderSync(msg.content) : msg.content}
              </Text>
            </Box>
          </Box>
        ))}

        {/* Tool calls */}
        {toolCalls.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            {toolCalls.slice(-3).map((tool, i) => (
              <Box key={`${tool.name}-${i}`}>
                <Text color="yellow">⚡ </Text>
                <Text color="magenta" bold>
                  {tool.name}
                </Text>
                <Text color="gray" dimColor>
                  {' '}
                  {tool.input}
                </Text>
              </Box>
            ))}
          </Box>
        )}

        {/* Streaming output */}
        {streamingText && (
          <Box flexDirection="row" marginTop={1}>
            <Text color="green">◆ </Text>
            <Box flexShrink={1} width={terminalWidth - 6}>
              <Text wrap="wrap">{streamingText}</Text>
            </Box>
          </Box>
        )}

        {/* Loading indicator */}
        {isLoading && !streamingText && toolCalls.length === 0 && (
          <Box marginTop={1}>
            <Text color="magenta">
              <Spinner type="dots" />
            </Text>
            <Text color="gray"> thinking...</Text>
          </Box>
        )}
      </Box>

      {/* Input */}
      <Box paddingX={1} borderStyle="round" borderColor={isLoading ? 'gray' : 'cyan'}>
        <Text color={isLoading ? 'gray' : 'cyan'}>{'❯ '}</Text>
        <Text>{input}</Text>
        {!isLoading && <Text color="cyan">▎</Text>}
      </Box>

      {/* Status bar */}
      <Box paddingX={1}>
        <Text color="gray" dimColor>
          ? help · esc quit · ↑↓ history
        </Text>
        {messages.length > visibleMessages.length && (
          <Text color="gray" dimColor>
            {' '}
            · {messages.length - visibleMessages.length} older
          </Text>
        )}
      </Box>
    </Box>
  );
}
