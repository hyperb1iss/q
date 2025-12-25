/**
 * Keyboard Shortcuts Help Overlay
 *
 * A stylish overlay showing all available keyboard shortcuts
 */

import { Box, Text } from 'ink';

interface ShortcutGroup {
  title: string;
  shortcuts: Array<{
    keys: string[];
    description: string;
  }>;
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['↑', '↓'], description: 'Browse input history' },
      { keys: ['Ctrl', 'L'], description: 'Clear conversation' },
      { keys: ['Ctrl', 'U'], description: 'Clear input line' },
    ],
  },
  {
    title: 'Actions',
    shortcuts: [
      { keys: ['Enter'], description: 'Send message' },
      { keys: ['Esc'], description: 'Exit / Cancel' },
      { keys: ['Ctrl', 'C'], description: 'Force quit' },
    ],
  },
  {
    title: 'Help',
    shortcuts: [{ keys: ['?'], description: 'Toggle this help' }],
  },
];

interface HelpOverlayProps {
  width: number;
  height: number;
}

export function HelpOverlay({ width, height }: HelpOverlayProps) {
  const overlayWidth = Math.min(50, width - 4);
  const overlayHeight = Math.min(18, height - 4);

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      alignItems="center"
      justifyContent="center"
    >
      <Box
        flexDirection="column"
        width={overlayWidth}
        height={overlayHeight}
        borderStyle="double"
        borderColor="magenta"
        paddingX={2}
        paddingY={1}
      >
        {/* Header */}
        <Box justifyContent="center" marginBottom={1}>
          <Text color="magenta" bold>
            ✨ Keyboard Shortcuts
          </Text>
        </Box>

        {/* Shortcut groups */}
        {SHORTCUT_GROUPS.map((group, groupIndex) => (
          <Box key={group.title} flexDirection="column" marginTop={groupIndex > 0 ? 1 : 0}>
            <Text color="cyan" bold dimColor>
              {group.title}
            </Text>
            {group.shortcuts.map((shortcut, i) => (
              <Box key={i} marginTop={i === 0 ? 0 : 0} flexDirection="row" alignItems="center">
                <Box width={16} flexDirection="row">
                  {shortcut.keys.map((key, ki) => (
                    <Box key={ki} flexDirection="row">
                      {ki > 0 && (
                        <Text color="gray" dimColor>
                          +
                        </Text>
                      )}
                      <Text color="magenta" bold>
                        {key}
                      </Text>
                    </Box>
                  ))}
                </Box>
                <Text color="gray">{shortcut.description}</Text>
              </Box>
            ))}
          </Box>
        ))}

        {/* Footer */}
        <Box flexGrow={1} />
        <Box justifyContent="center">
          <Text color="gray" dimColor>
            Press ? to close
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
