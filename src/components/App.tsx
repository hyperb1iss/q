/**
 * Main Interactive TUI Application
 */

import { Box, Text, useApp, useInput, useStdout } from 'ink';
import Spinner from 'ink-spinner';
import { useCallback, useEffect, useState } from 'react';
import type { SDKAssistantMessage, SDKResultMessage } from '../lib/agent.js';
import { streamQuery } from '../lib/agent.js';
import { renderSync } from '../lib/markdown.js';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AppProps {
  initialPrompt?: string;
  model?: string;
}

export function App({ initialPrompt, model }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [stats, setStats] = useState<{ tokens: number; cost: number } | null>(null);

  const terminalHeight = stdout?.rows ?? 24;

  // Handle query submission
  const submitQuery = useCallback(
    async (prompt: string) => {
      if (!prompt.trim() || isLoading) return;

      // Add user message
      setMessages(prev => [...prev, { role: 'user', content: prompt }]);
      setInput('');
      setIsLoading(true);
      setStreamingText('');
      setStats(null);

      try {
        let fullText = '';
        const opts: Parameters<typeof streamQuery>[1] = {
          tools: [],
          includePartialMessages: true,
        };
        if (model) {
          opts.model = model;
        }

        for await (const message of streamQuery(prompt, opts)) {
          if (message.type === 'assistant') {
            const assistantMsg = message as SDKAssistantMessage;
            for (const block of assistantMsg.message.content) {
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

        // Add assistant message
        setMessages(prev => [...prev, { role: 'assistant', content: fullText }]);
        setStreamingText('');
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

  // Handle initial prompt
  useEffect(() => {
    if (initialPrompt) {
      void submitQuery(initialPrompt);
    }
  }, [initialPrompt, submitQuery]);

  // Handle keyboard input
  useInput((ch, key) => {
    if (key.escape || (key.ctrl && ch === 'c')) {
      exit();
      return;
    }

    if (isLoading) return;

    if (key.return) {
      void submitQuery(input);
    } else if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1));
    } else if (ch && !key.ctrl && !key.meta) {
      setInput(prev => prev + ch);
    }
  });

  return (
    <Box flexDirection="column" height={terminalHeight}>
      {/* Header */}
      <Box paddingX={1} borderStyle="single" borderColor="magenta">
        <Text color="magenta" bold>
          q
        </Text>
        <Text color="gray"> - The Shell's Quiet Companion</Text>
        <Box flexGrow={1} />
        {stats && (
          <Text color="gray">
            {stats.tokens} tokens | ${stats.cost.toFixed(4)}
          </Text>
        )}
      </Box>

      {/* Messages */}
      <Box flexDirection="column" flexGrow={1} paddingX={1} overflow="hidden">
        {messages.map((msg, i) => (
          <Box key={i} flexDirection="column" marginY={1}>
            <Text color={msg.role === 'user' ? 'cyan' : 'green'} bold>
              {msg.role === 'user' ? '› ' : '◆ '}
            </Text>
            <Box marginLeft={2}>
              <Text>{msg.role === 'assistant' ? renderSync(msg.content) : msg.content}</Text>
            </Box>
          </Box>
        ))}

        {/* Streaming output */}
        {streamingText && (
          <Box flexDirection="column" marginY={1}>
            <Text color="green" bold>
              ◆{' '}
            </Text>
            <Box marginLeft={2}>
              <Text>{streamingText}</Text>
            </Box>
          </Box>
        )}

        {/* Loading indicator */}
        {isLoading && !streamingText && (
          <Box marginY={1}>
            <Text color="magenta">
              <Spinner type="dots" />
            </Text>
            <Text color="gray"> Thinking...</Text>
          </Box>
        )}
      </Box>

      {/* Input */}
      <Box paddingX={1} borderStyle="single" borderColor={isLoading ? 'gray' : 'cyan'}>
        <Text color={isLoading ? 'gray' : 'cyan'}>{'> '}</Text>
        <Text>{input}</Text>
        {!isLoading && <Text color="cyan">▌</Text>}
      </Box>

      {/* Status bar */}
      <Box paddingX={1}>
        <Text color="gray">ESC to quit | Enter to send</Text>
      </Box>
    </Box>
  );
}
