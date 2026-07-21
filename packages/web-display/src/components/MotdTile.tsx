import type { Tile } from '@smart-display/shared';

interface Props {
  tile: Tile;
}

export function MotdTile({ tile }: Props) {
  const message = (tile.config.message as string | undefined) ?? '';
  const expiresAt = (tile.config.expiresAt as string | null | undefined) ?? null;

  if (!message.trim()) return null;
  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) return null;

  return (
    <div
      style={{
        fontSize: 'calc(1.5rem * var(--tile-font-scale, 1))',
        color: 'var(--text-primary)',
        textAlign: 'center',
        lineHeight: 1.4,
        padding: '0.25rem 0',
        wordBreak: 'break-word',
      }}
    >
      {message}
    </div>
  );
}
