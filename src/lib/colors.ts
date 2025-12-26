/**
 * SilkCircuit Design Language - Terminal Color Palette
 *
 * All colors use ANSI true color (24-bit) for maximum vibrancy.
 * Based on the Neon variant of SilkCircuit.
 *
 * Supports NO_COLOR standard (https://no-color.org/) for accessibility.
 */

export type ColorMode = 'auto' | 'always' | 'never';

/** Current color mode - can be set by CLI */
let colorMode: ColorMode = 'auto';

/**
 * Set the color mode
 */
export function setColorMode(mode: ColorMode): void {
  colorMode = mode;
}

/**
 * Check if colors should be enabled
 */
export function colorsEnabled(): boolean {
  if (colorMode === 'always') return true;
  if (colorMode === 'never') return false;

  // Auto mode: respect NO_COLOR standard and TTY detection
  if (process.env.NO_COLOR !== undefined) return false;
  if (process.env.FORCE_COLOR !== undefined) return true;
  return process.stdout.isTTY ?? false;
}

export const colors = {
  // Primary palette
  purple: '\x1b[38;2;225;53;255m', // #e135ff - Claude thoughts, keywords
  cyan: '\x1b[38;2;128;255;234m', // #80ffea - User input, functions
  coral: '\x1b[38;2;255;106;193m', // #ff6ac1 - Commands, code blocks
  yellow: '\x1b[38;2;241;250;140m', // #f1fa8c - Warnings, highlights
  green: '\x1b[38;2;80;250;123m', // #50fa7b - Success, confirmations
  red: '\x1b[38;2;255;99;99m', // #ff6363 - Errors

  // Neutral palette
  fg: '\x1b[38;2;248;248;242m', // #f8f8f2 - Primary text
  muted: '\x1b[38;2;139;133;160m', // #8b85a0 - Dim text, comments
  bg: '\x1b[48;2;18;16;26m', // #12101a - Background
  bgDark: '\x1b[48;2;10;8;18m', // #0a0812 - Darker background
  bgHighlight: '\x1b[48;2;26;22;42m', // #1a162a - Highlight background

  // Modifiers
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  reset: '\x1b[0m',
} as const;

export type ColorName = keyof typeof colors;

/**
 * Apply a color to text with automatic reset
 * Returns plain text if colors are disabled
 */
export function color(text: string, ...styles: ColorName[]): string {
  if (!colorsEnabled()) return text;
  const prefix = styles.map(s => colors[s]).join('');
  return `${prefix}${text}${colors.reset}`;
}

/**
 * Semantic color helpers
 */
export const semantic = {
  success: (text: string) => color(text, 'green'),
  error: (text: string) => color(text, 'red'),
  warning: (text: string) => color(text, 'yellow'),
  info: (text: string) => color(text, 'cyan'),
  muted: (text: string) => color(text, 'muted'),
  highlight: (text: string) => color(text, 'purple', 'bold'),
  code: (text: string) => color(text, 'coral'),
} as const;

/**
 * Status indicators (computed on access to respect color mode)
 */
export const status = {
  get success() {
    return color('✓', 'green');
  },
  get error() {
    return color('✗', 'red');
  },
  get warning() {
    return color('⚠', 'yellow');
  },
  get info() {
    return color('ℹ', 'cyan');
  },
  get pending() {
    return color('○', 'muted');
  },
  get active() {
    return color('●', 'purple');
  },
  get tool() {
    return color('▸', 'coral');
  },
  get thinking() {
    return color('◆', 'purple');
  },
} as const;
