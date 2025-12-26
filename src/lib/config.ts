/**
 * Configuration system using c12
 *
 * Supports loading config from:
 * - q.config.{ts,js,mjs,cjs,json}
 * - .config/q.{ts,js,mjs,cjs,json}
 * - .qrc
 * - package.json "q" field
 */

import { loadConfig } from 'c12';
import type { Config } from '../types.js';
import { defaultConfig } from '../types.js';

/** Config file name (without extension) */
const CONFIG_NAME = 'q';

/** Loaded config cache */
let cachedConfig: Config | null = null;

/**
 * Define config helper for TypeScript config files
 * Users can import this in their q.config.ts for type hints
 */
export function defineConfig(config: Partial<Config>): Partial<Config> {
  return config;
}

export interface LoadConfigOptions {
  cwd?: string;
  /** Skip loading config files entirely (for security) */
  skipLoad?: boolean;
}

/**
 * Load configuration from disk
 * Searches up the directory tree for config files
 */
export async function loadQConfig(options: LoadConfigOptions = {}): Promise<Config> {
  const { cwd, skipLoad = false } = options;

  // Return cached config if available
  if (cachedConfig) {
    return cachedConfig;
  }

  // If skipLoad, just return defaults
  if (skipLoad) {
    cachedConfig = { ...defaultConfig };
    return cachedConfig;
  }

  const { config } = await loadConfig<Partial<Config>>({
    name: CONFIG_NAME,
    cwd: cwd ?? process.cwd(),
    defaults: defaultConfig,
    // Also check ~/.config/q for global config
    globalRc: true,
    // Support .qrc files
    rcFile: `.${CONFIG_NAME}rc`,
    // Support package.json "q" field
    packageJson: true,
  });

  // Merge with defaults to ensure all fields exist
  cachedConfig = {
    ...defaultConfig,
    ...config,
    context: {
      ...defaultConfig.context,
      ...config?.context,
    },
    safety: {
      ...defaultConfig.safety,
      ...config?.safety,
    },
    prompts: {
      ...defaultConfig.prompts,
      ...config?.prompts,
    },
  };

  return cachedConfig;
}

/**
 * Clear the config cache (useful for testing or reloading)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}

/**
 * Get config synchronously (must call loadQConfig first)
 * Returns default config if not loaded yet
 */
export function getConfig(): Config {
  return cachedConfig ?? defaultConfig;
}
