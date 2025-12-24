/**
 * Build script for q
 */

const result = await Bun.build({
  entrypoints: ['./src/cli.ts'],
  outdir: './dist',
  target: 'bun',
  external: [
    // SDK spawns Claude Code as subprocess - can't be bundled
    '@anthropic-ai/claude-agent-sdk',
    // Ink has optional devtools dependency
    'react-devtools-core',
  ],
});

if (!result.success) {
  console.error('Build failed:');
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log(`✓ Built ${result.outputs.length} file(s)`);
