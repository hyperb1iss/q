/**
 * Example q configuration file
 *
 * Copy this to q.config.ts in your project root or ~/.config/q/
 * Supports: .ts, .js, .mjs, .cjs, .json, .yaml, .toml
 *
 * Import path depends on your setup:
 * - Development (in q repo):     import { defineConfig } from './src/lib/config.js';
 * - Installed globally:          import { defineConfig } from '@anthropic-ai/q/config';
 * - Or just use plain object:    export default { model: 'sonnet', ... };
 */

// For development in this repo:
import { defineConfig } from './src/lib/config.js';

// For installed package, use:
// import { defineConfig } from '@anthropic-ai/q/config';

export default defineConfig({
  // Default model: 'sonnet' | 'opus' | 'haiku'
  model: 'sonnet',

  // Max tokens for responses
  maxTokens: 4096,

  // Theme variant: 'neon' | 'vibrant' | 'soft' | 'glow'
  theme: 'neon',

  // Context injection
  context: {
    git: true, // Include git status
    cwd: true, // Include current directory
    lastCommand: false, // Include last shell command
  },

  // Prompt aliases - shortcuts for common queries
  prompts: {
    explain: 'Explain this code in simple terms:',
    review: 'Review this code for bugs and improvements:',
    test: 'Write tests for this code:',
    refactor: 'Refactor this code to be more readable:',
  },

  // Safety settings
  safety: {
    confirmDestructive: true, // Confirm before destructive ops
    maxCostPerQuery: 0.5, // Max cost in USD per query
    blockedCommands: ['rm -rf /', 'dd if='], // Blocked shell commands
  },

  // Optional: Custom system prompt addition
  // systemPrompt: 'Always respond in a friendly tone.',
});
