/**
 * Build script for q
 *
 * Usage:
 *   bun run build.ts           # Bundle to dist/
 *   bun run build.ts --compile # Compile to standalone binary
 */

// Packages that can't be bundled
const EXTERNALS = [
  '@anthropic-ai/claude-agent-sdk', // Spawns Claude Code subprocess
  'react-devtools-core', // Ink optional devtools
  'node-fetch-native', // ESM/CJS interop bug: github.com/unjs/node-fetch-native/issues/114
  'shiki', // Lazy-loaded syntax highlighter - too large to bundle (9MB+)
];

const isCompile = process.argv.includes('--compile');

if (isCompile) {
  // Compile to standalone binary
  const { exited } = Bun.spawn(
    [
      'bun',
      'build',
      'src/cli.ts',
      '--compile',
      '--outfile',
      'q',
      ...EXTERNALS.flatMap(p => ['--external', p]),
    ],
    { stdout: 'inherit', stderr: 'inherit' }
  );
  const code = await exited;
  process.exit(code);
} else {
  // Bundle to dist/
  const result = await Bun.build({
    entrypoints: ['./src/cli.ts'],
    outdir: './dist',
    target: 'bun',
    external: EXTERNALS,
  });

  if (!result.success) {
    console.error('Build failed:');
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }

  console.log(`✓ Built ${result.outputs.length} file(s)`);
}
