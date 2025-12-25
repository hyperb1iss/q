/**
 * Terminal Markdown Renderer
 *
 * Renders markdown with syntax highlighting using shiki and SilkCircuit colors.
 * Shiki is lazy-loaded only when code blocks require highlighting.
 */

import { Marked, type Token, type Tokens } from 'marked';
import { colors } from './colors.js';

/** Dynamically imported shiki types */
type Highlighter = Awaited<ReturnType<typeof import('shiki')['createHighlighter']>>;

let highlighter: Highlighter | null = null;
let shikiLoading: Promise<Highlighter> | null = null;

/** Languages we support - loaded on demand */
const SUPPORTED_LANGS = [
  'javascript',
  'typescript',
  'python',
  'rust',
  'go',
  'bash',
  'shell',
  'json',
  'yaml',
  'toml',
  'markdown',
  'html',
  'css',
  'sql',
  'diff',
] as const;

type SupportedLang = (typeof SUPPORTED_LANGS)[number];

/**
 * Initialize the syntax highlighter (lazy loaded via dynamic import)
 */
async function getHighlighter(): Promise<Highlighter> {
  if (highlighter) return highlighter;

  // Avoid multiple simultaneous loads
  if (shikiLoading) return shikiLoading;

  shikiLoading = (async () => {
    const { createHighlighter } = await import('shiki');
    highlighter = await createHighlighter({
      themes: ['github-dark'],
      langs: [...SUPPORTED_LANGS],
    });
    return highlighter;
  })();

  return shikiLoading;
}

/**
 * Check if a language needs syntax highlighting
 */
function needsHighlighting(lang: string): lang is SupportedLang {
  return SUPPORTED_LANGS.includes(lang as SupportedLang);
}

/**
 * Render a code block without syntax highlighting (fast path)
 */
function renderCodeBlockSimple(code: string, lang: string): string {
  const lines = code.split('\n');
  const langLabel = lang ? ` ${colors.cyan}${lang}${colors.reset}` : '';
  const header = `${colors.muted}┌${langLabel}${'─'.repeat(Math.max(0, 77 - lang.length))}┐${colors.reset}`;
  const boxBottom = `${colors.muted}└${'─'.repeat(78)}┘${colors.reset}`;
  const content = lines.map(line => `${colors.muted}│${colors.reset} ${line}`).join('\n');
  return `${header}\n${content}\n${boxBottom}`;
}

/**
 * Render a code block with syntax highlighting
 */
async function renderCodeBlock(code: string, lang: string): Promise<string> {
  // Skip shiki for unsupported languages - use fast path
  if (!needsHighlighting(lang)) {
    return renderCodeBlockSimple(code, lang);
  }

  // Load shiki on demand
  const hl = await getHighlighter();

  // Get highlighted code as HTML
  const highlighted = hl.codeToHtml(code, {
    lang,
    theme: 'github-dark',
  });

  // Convert HTML to ANSI
  const ansi = htmlToAnsi(highlighted);

  // Add box around code
  const lines = ansi.split('\n');
  const boxBottom = `${colors.muted}└${'─'.repeat(78)}┘${colors.reset}`;
  const langLabel = lang ? ` ${colors.cyan}${lang}${colors.reset}` : '';
  const header = `${colors.muted}┌${langLabel}${'─'.repeat(Math.max(0, 77 - lang.length))}┐${colors.reset}`;
  const content = lines.map(line => `${colors.muted}│${colors.reset} ${line}`).join('\n');

  return `${header}\n${content}\n${boxBottom}`;
}

/**
 * Convert shiki HTML output to ANSI escape codes
 */
function htmlToAnsi(html: string): string {
  // Remove HTML structure, keep just the content with colors
  const result = html
    // Remove pre/code wrappers
    .replace(/<\/?pre[^>]*>/g, '')
    .replace(/<\/?code[^>]*>/g, '')
    // Convert spans with color styles to ANSI
    .replace(/<span style="color:\s*#([0-9a-fA-F]{6})">/g, (_match, hex) => {
      const r = Number.parseInt(hex.slice(0, 2), 16);
      const g = Number.parseInt(hex.slice(2, 4), 16);
      const b = Number.parseInt(hex.slice(4, 6), 16);
      return `\x1b[38;2;${r};${g};${b}m`;
    })
    .replace(/<\/span>/g, colors.reset)
    // Handle line breaks
    .replace(/<br\s*\/?>/g, '\n')
    // Decode HTML entities
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Remove any remaining HTML tags
    .replace(/<[^>]+>/g, '');

  return result.trim();
}

/**
 * Render inline markdown elements
 */
function renderInline(text: string): string {
  return (
    text
      // Bold
      .replace(/\*\*(.+?)\*\*/g, `${colors.bold}$1${colors.reset}`)
      .replace(/__(.+?)__/g, `${colors.bold}$1${colors.reset}`)
      // Italic
      .replace(/\*(.+?)\*/g, `${colors.dim}$1${colors.reset}`)
      .replace(/_(.+?)_/g, `${colors.dim}$1${colors.reset}`)
      // Inline code
      .replace(/`([^`]+)`/g, `${colors.coral}$1${colors.reset}`)
      // Links (show URL in parens)
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        `${colors.cyan}$1${colors.reset} ${colors.muted}($2)${colors.reset}`
      )
  );
}

/**
 * Render a single markdown token
 */
async function renderToken(token: Token): Promise<string> {
  switch (token.type) {
    case 'heading': {
      const t = token as Tokens.Heading;
      const prefix = '#'.repeat(t.depth);
      const text = renderInline(t.text);
      if (t.depth === 1) {
        return `\n${colors.purple}${colors.bold}${prefix} ${text}${colors.reset}\n`;
      }
      if (t.depth === 2) {
        return `\n${colors.cyan}${colors.bold}${prefix} ${text}${colors.reset}\n`;
      }
      return `\n${colors.yellow}${prefix} ${text}${colors.reset}\n`;
    }

    case 'paragraph': {
      const t = token as Tokens.Paragraph;
      return `${renderInline(t.text)}\n`;
    }

    case 'code': {
      const t = token as Tokens.Code;
      return await renderCodeBlock(t.text, t.lang ?? '');
    }

    case 'blockquote': {
      const t = token as Tokens.Blockquote;
      const content = await renderTokens(t.tokens);
      const lines = content.split('\n').filter(l => l.trim());
      return `${lines.map(line => `${colors.muted}│${colors.reset} ${line}`).join('\n')}\n`;
    }

    case 'list': {
      const t = token as Tokens.List;
      const items: string[] = [];
      for (const [i, item] of t.items.entries()) {
        const bullet = t.ordered
          ? `${colors.coral}${i + 1}.${colors.reset}`
          : `${colors.purple}•${colors.reset}`;
        const content = await renderTokens(item.tokens);
        items.push(`  ${bullet} ${content.trim()}`);
      }
      return `${items.join('\n')}\n`;
    }

    case 'list_item': {
      const t = token as Tokens.ListItem;
      return await renderTokens(t.tokens);
    }

    case 'hr':
      return `\n${colors.muted}${'─'.repeat(80)}${colors.reset}\n`;

    case 'space':
      return '\n';

    case 'text': {
      const t = token as Tokens.Text;
      // Check if it has nested tokens (like in list items)
      if ('tokens' in t && Array.isArray(t.tokens)) {
        return await renderTokens(t.tokens);
      }
      return renderInline(t.text);
    }

    case 'strong': {
      const t = token as Tokens.Strong;
      return `${colors.bold}${t.text}${colors.reset}`;
    }

    case 'em': {
      const t = token as Tokens.Em;
      return `${colors.dim}${t.text}${colors.reset}`;
    }

    case 'codespan': {
      const t = token as Tokens.Codespan;
      return `${colors.coral}${t.text}${colors.reset}`;
    }

    case 'link': {
      const t = token as Tokens.Link;
      return `${colors.cyan}${t.text}${colors.reset} ${colors.muted}(${t.href})${colors.reset}`;
    }

    default:
      // For unknown tokens, try to extract text
      if ('text' in token && typeof token.text === 'string') {
        return renderInline(token.text);
      }
      return '';
  }
}

/**
 * Render an array of tokens
 */
async function renderTokens(tokens: Token[]): Promise<string> {
  const parts: string[] = [];
  for (const token of tokens) {
    parts.push(await renderToken(token));
  }
  return parts.join('');
}

/**
 * Render markdown to terminal-formatted string
 */
export async function render(markdown: string): Promise<string> {
  const marked = new Marked();
  const tokens = marked.lexer(markdown);
  const rendered = await renderTokens(tokens);

  // Clean up extra newlines
  return rendered.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Render markdown synchronously (without syntax highlighting)
 * Use this for simple content where async isn't needed
 */
export function renderSync(markdown: string): string {
  const marked = new Marked();
  const tokens = marked.lexer(markdown);

  const renderTokenSync = (token: Token): string => {
    switch (token.type) {
      case 'heading': {
        const t = token as Tokens.Heading;
        const prefix = '#'.repeat(t.depth);
        const text = renderInline(t.text);
        if (t.depth === 1)
          return `\n${colors.purple}${colors.bold}${prefix} ${text}${colors.reset}\n`;
        if (t.depth === 2)
          return `\n${colors.cyan}${colors.bold}${prefix} ${text}${colors.reset}\n`;
        return `\n${colors.yellow}${prefix} ${text}${colors.reset}\n`;
      }
      case 'paragraph': {
        const t = token as Tokens.Paragraph;
        return `${renderInline(t.text)}\n`;
      }
      case 'code': {
        const t = token as Tokens.Code;
        const lines = t.text.split('\n');
        const lang = t.lang ?? '';
        const header = `${colors.muted}┌ ${colors.cyan}${lang}${colors.muted}${'─'.repeat(Math.max(0, 76 - lang.length))}┐${colors.reset}`;
        const bottom = `${colors.muted}└${'─'.repeat(78)}┘${colors.reset}`;
        const content = lines.map(line => `${colors.muted}│${colors.reset} ${line}`).join('\n');
        return `${header}\n${content}\n${bottom}\n`;
      }
      case 'list': {
        const t = token as Tokens.List;
        return `${t.items
          .map((item, i) => {
            const bullet = t.ordered
              ? `${colors.coral}${i + 1}.${colors.reset}`
              : `${colors.purple}•${colors.reset}`;
            const content = item.tokens.map(renderTokenSync).join('');
            return `  ${bullet} ${content.trim()}`;
          })
          .join('\n')}\n`;
      }
      case 'hr':
        return `\n${colors.muted}${'─'.repeat(80)}${colors.reset}\n`;
      case 'space':
        return '\n';
      case 'text': {
        const t = token as Tokens.Text;
        if ('tokens' in t && Array.isArray(t.tokens)) {
          return t.tokens.map(renderTokenSync).join('');
        }
        return renderInline(t.text);
      }
      default:
        if ('text' in token && typeof token.text === 'string') {
          return renderInline(token.text);
        }
        return '';
    }
  };

  return tokens
    .map(renderTokenSync)
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
