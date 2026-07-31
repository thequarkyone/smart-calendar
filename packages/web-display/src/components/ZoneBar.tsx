import React from 'react';
import type { Settings, CalendarState, WeatherState, TasksState, HaState, Tile } from '@smart-display/shared';
import type { SpotifyState } from '@smart-display/shared';

export type RenderWidgetFn = (widgetId: string) => React.ReactNode;

/**
 * Generic zone bar that renders a list of widgets either horizontally (row) or
 * vertically (column). Used for all four layout zones in ClassicLayout.
 */
export function ZoneBar({
  direction,
  widgets,
  width,
  height,
  renderWidget,
  borderStyle,
}: {
  direction: 'row' | 'column';
  widgets: string[];
  width?: number;
  height?: number;
  renderWidget: RenderWidgetFn;
  borderStyle?: React.CSSProperties;
}) {
  const isRow = direction === 'row';

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: isRow ? 'row' : 'column',
    flexShrink: 0,
    overflowY: isRow ? undefined : 'auto',
    overflowX: isRow ? 'auto' : undefined,
    containerType: 'inline-size',
    ...(width !== undefined ? { width: `${width}px` } : {}),
    ...(height !== undefined ? { height: `${height}px` } : {}),
    ...(isRow
      ? { padding: '0.5rem 1rem', alignItems: 'center', gap: '1.5rem' }
      // Cards are now self-contained boxes (border/background) rather than divider-separated
      // flush content, so they need visible breathing room between them instead of gap: 0.
      : { padding: '1.5rem 1rem', gap: '0.85rem' }),
    ...borderStyle,
  };

  return (
    <div style={containerStyle}>
      {widgets.map((id) => (
        <React.Fragment key={id}>
          {renderWidget(id)}
        </React.Fragment>
      ))}
    </div>
  );
}

/** Shared props needed to render any widget. */
export interface WidgetRenderProps {
  settings: Settings;
  calendar: CalendarState | null;
  weather: WeatherState | null;
  tasks: TasksState | null;
  ha: HaState | null;
  spotify: SpotifyState | null;
  now: Date;
  tileMap: Map<string, Tile>;
}
