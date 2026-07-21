import type { Tile } from '@smart-display/shared';

interface Props {
  tile: Tile;
}

export function CustomTextTile({ tile }: Props) {
  const heading = (tile.config.heading as string | undefined) ?? '';
  const body = (tile.config.body as string | undefined) ?? '';

  if (!heading.trim() && !body.trim()) return null;

  return (
    <div
      style={{
        color: 'var(--text-primary)',
        lineHeight: 1.4,
        padding: '0.25rem 0',
        wordBreak: 'break-word',
      }}
    >
      {heading.trim() && (
        <p
          style={{
            fontSize: 'calc(1.1rem * var(--tile-font-scale, 1))',
            fontWeight: 600,
            marginBottom: body.trim() ? '0.3rem' : 0,
            color: 'var(--text-primary)',
          }}
        >
          {heading}
        </p>
      )}
      {body.trim() && (
        <p
          style={{
            fontSize: 'calc(0.95rem * var(--tile-font-scale, 1))',
            color: 'var(--text-secondary)',
            whiteSpace: 'pre-wrap',
          }}
        >
          {body}
        </p>
      )}
    </div>
  );
}
