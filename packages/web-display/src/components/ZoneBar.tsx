import React from 'react';
import type { Settings, CalendarState, WeatherState, TasksState, HaState, Tile } from '@smart-display/shared';
import type { SpotifyState } from '@smart-display/shared';

export type RenderWidgetFn = (widgetId: string, first: boolean) => React.ReactNode;

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
      : { padding: '1.5rem 1rem', gap: 0 }),
    ...borderStyle,
  };

  return (
    <div style={containerStyle}>
      {widgets.map((id, i) => (
        <React.Fragment key={id}>
          {renderWidget(id, i === 0)}
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
