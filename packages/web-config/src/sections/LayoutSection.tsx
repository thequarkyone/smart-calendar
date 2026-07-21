import { useState, useEffect, useCallback } from 'react';
import type { Template, LayoutConfig } from '@smart-display/shared';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getTemplates, patchSettings } from '../api.js';
import { useSettings } from '../hooks/useSettings.js';
import { useTiles } from '../hooks/useTiles.js';
import { SectionCard } from '../components/SectionCard.js';
import { LAYOUT_PRESETS } from '../data/layoutPresets.js';

const CAPABILITY_TAGS: Record<string, string[]> = {
  'classic':     ['Sidebar', 'Calendar', 'Photo strip', 'News'],
  'minimal':     ['Clock', 'Calendar'],
  'photo-focus': ['Full-screen photo', 'Clock overlay'],
};

const ALL_SIDEBAR_WIDGETS: { id: string; label: string }[] = [
  { id: 'clock',          label: 'Clock & Date' },
  { id: 'weather',        label: 'Weather' },
  { id: 'calendar',       label: 'Calendar' },
  { id: 'tasks',          label: 'Tasks' },
  { id: 'home_assistant', label: 'Home Assistant' },
  { id: 'today_agenda',   label: 'Today Agenda' },
  { id: 'countdown',      label: 'Countdown' },
  { id: 'motd',           label: 'Message of the Day' },
  { id: 'custom_text',   label: 'Custom Text' },
];

const DEFAULT_SIDEBAR_WIDGETS = ALL_SIDEBAR_WIDGETS.map((w) => w.id);

function SortableWidgetRow({
  id,
  label,
  isDisabled,
  saving,
  onRemove,
}: {
  id: string;
  label: string;
  isDisabled: boolean;
  saving: boolean;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md bg-slate-700/60 px-3 py-2"
    >
      {/* drag handle */}
      <button
        type="button"
        {...listeners}
        {...attributes}
        aria-label="Drag to reorder"
        disabled={saving}
        className="cursor-grab active:cursor-grabbing touch-none text-slate-500 hover:text-slate-300 disabled:opacity-30 p-3 -ml-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
      >
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
          <circle cx="6" cy="5" r="1.5" />
          <circle cx="6" cy="10" r="1.5" />
          <circle cx="6" cy="15" r="1.5" />
          <circle cx="14" cy="5" r="1.5" />
          <circle cx="14" cy="10" r="1.5" />
          <circle cx="14" cy="15" r="1.5" />
        </svg>
      </button>
      <span className="flex-1 text-sm text-slate-200">
        {label}
        {isDisabled && <span className="ml-1.5 text-xs text-amber-500">(off)</span>}
      </span>
      <button
        type="button"
        disabled={saving}
        onClick={onRemove}
        className="rounded p-2 min-h-[44px] text-slate-500 hover:text-red-400 disabled:opacity-30 disabled:cursor-default flex items-center justify-center"
        aria-label={`Remove ${label}`}
      >
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M5 5l10 10M15 5L5 15" />
        </svg>
      </button>
    </div>
  );
}

const CALENDAR_SIZE_OPTIONS: { value: LayoutConfig['calendarSize']; label: string; desc: string }[] = [
  { value: 'full',   label: 'Full',   desc: 'Maximum calendar — hides all bars' },
  { value: 'large',  label: 'Large',  desc: 'Default — calendar takes center' },
  { value: 'medium', label: 'Medium', desc: 'Calendar ~600 px, room for widgets' },
  { value: 'small',  label: 'Small',  desc: 'Calendar ~400 px, widget-dominant' },
];

/** Reusable drag-and-drop zone composer. Used for left/right/top/bottom bars. */
function ZoneComposer({
  title,
  description,
  widgets,
  enabled,
  saving,
  tiles: tileList,
  onToggleEnabled,
  onWidgetsChange,
}: {
  title: string;
  description: string;
  widgets: string[];
  enabled: boolean;
  saving: boolean;
  tiles: { id: string; enabled: boolean }[];
  onToggleEnabled: () => void;
  onWidgetsChange: (next: string[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = widgets.indexOf(String(active.id));
    const newIndex = widgets.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    onWidgetsChange(arrayMove(widgets, oldIndex, newIndex));
  };

  const toggle = (id: string) => {
    const next = widgets.includes(id)
      ? widgets.filter((w) => w !== id)
      : [...widgets, id];
    onWidgetsChange(next);
  };

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/30 p-4 space-y-3">
      <label className="flex items-center justify-between gap-3 cursor-pointer">
        <div>
          <span className="text-sm font-medium text-slate-200">{title}</span>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={saving}
          onClick={onToggleEnabled}
          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 ${
            enabled ? 'bg-blue-600' : 'bg-slate-600'
          }`}
        >
          <span
            className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg transition-transform ${
              enabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </label>

      {enabled && (
        <>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={widgets} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {widgets.map((wId) => {
                  const meta = ALL_SIDEBAR_WIDGETS.find((w) => w.id === wId);
                  if (!meta) return null;
                  const tile = tileList.find((t) => t.id === wId);
                  const isDisabled = tile !== undefined && !tile.enabled;
                  return (
                    <SortableWidgetRow
                      key={wId}
                      id={wId}
                      label={meta.label}
                      isDisabled={isDisabled}
                      saving={saving}
                      onRemove={() => toggle(wId)}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
          {ALL_SIDEBAR_WIDGETS.filter((w) => !widgets.includes(w.id)).length > 0 && (
            <div className="space-y-2">
              {ALL_SIDEBAR_WIDGETS.filter((w) => !widgets.includes(w.id)).map((w) => (
                <div
                  key={w.id}
                  className="flex items-center gap-2 rounded-md border border-dashed border-slate-700 px-3 py-2 opacity-50"
                >
                  <span className="w-6" />
                  <span className="flex-1 text-sm text-slate-400">{w.label}</span>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => toggle(w.id)}
                    className="rounded p-2 min-h-[44px] text-slate-400 hover:text-green-400 disabled:opacity-30 disabled:cursor-default flex items-center justify-center"
                    aria-label={`Add ${w.label}`}
                  >
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M10 4v12M4 10h12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function LayoutSection() {
  const { settings, loading: settingsLoading } = useSettings();
  const { tiles } = useTiles();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [layoutSaved, setLayoutSaved] = useState(false);
  const [appliedPreset, setAppliedPreset] = useState<string | null>(null);
  const [templateSaved, setTemplateSaved] = useState(false);

  useEffect(() => {
    getTemplates()
      .then(setTemplates)
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setTemplatesLoading(false));
  }, []);

  const activeId = settings?.activeTemplateId ?? 'classic';
  const lc = settings?.layoutConfig;
  const showSidebar = lc?.showSidebar !== false;
  const sidebarWidgets: string[] = lc?.sidebarWidgets?.length ? lc.sidebarWidgets : DEFAULT_SIDEBAR_WIDGETS;
  const rightBarWidgets: string[] = lc?.rightBarWidgets ?? [];
  const topBarWidgets: string[] = lc?.topBarWidgets ?? [];
  const bottomBarWidgets: string[] = lc?.bottomBarWidgets ?? [];
  const calendarSize: LayoutConfig['calendarSize'] = lc?.calendarSize ?? 'large';
  const calendarViewMode: LayoutConfig['calendarViewMode'] = lc?.calendarViewMode ?? 'month';
  const calendarRollingWeeks = lc?.calendarRollingWeeks ?? 4;

  const patchLayout = useCallback(async (patch: Partial<LayoutConfig>) => {
    if (saving || !settings) return;
    setSaving(true);
    try {
      await patchSettings({ layoutConfig: { ...settings.layoutConfig, ...patch } });
      setLayoutSaved(true);
      setTimeout(() => setLayoutSaved(false), 2000);
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }, [saving, settings]);

  const handleApplyPreset = async (presetId: string) => {
    if (saving) return;
    const preset = LAYOUT_PRESETS.find((p) => p.id === presetId);
    if (!preset || !settings) return;
    setSaving(true);
    try {
      await patchSettings({
        activeTemplateId: preset.patch.activeTemplateId,
        layoutConfig: { ...settings.layoutConfig, ...preset.patch.layoutConfig },
      });
      setAppliedPreset(presetId);
      setTimeout(() => setAppliedPreset(null), 2000);
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleSelectTemplate = async (id: string) => {
    if (saving) return;
    setSaving(true);
    try {
      await patchSettings({ activeTemplateId: id });
      setTemplateSaved(true);
      setTimeout(() => setTemplateSaved(false), 2000);
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  if (settingsLoading || templatesLoading) {
    return (
      <div className="p-6">
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-100 mb-0.5">Layout</h2>
        <p className="text-sm text-slate-400">Choose a display layout and configure which widgets appear.</p>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Starter presets */}
      <SectionCard title="Starter Presets">
        <p className="text-xs text-slate-400 mb-3">
          Pick a curated starting point — sets your layout, sidebar widgets, and panel sizes in one click. You can customise everything afterward.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {LAYOUT_PRESETS.map((preset) => {
            const isApplied = appliedPreset === preset.id;
            return (
              <div
                key={preset.id}
                className="flex flex-col gap-2 rounded-lg border border-slate-700 bg-slate-800/40 p-3"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-700">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d={preset.icon} />
                    </svg>
                  </span>
                  <span className="text-sm font-semibold text-slate-100">{preset.name}</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{preset.description}</p>
                <div className="flex flex-wrap gap-1 mb-1">
                  {preset.capabilities.map((cap) => (
                    <span key={cap} className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">{cap}</span>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleApplyPreset(preset.id)}
                  className="w-full rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 text-xs font-semibold text-white transition-colors"
                >
                  {isApplied ? 'Applied ✓' : 'Apply'}
                </button>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Template picker */}
      <SectionCard title="Display Template">
        {templateSaved && <p className="text-xs text-green-400 mb-2">Saved ✓</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {templates.map((tpl) => {
            const isActive = activeId === tpl.id;
            return (
              <button
                key={tpl.id}
                type="button"
                disabled={saving}
                onClick={() => void handleSelectTemplate(tpl.id)}
                className={`text-left rounded-lg border-2 p-3 min-h-[140px] transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:opacity-50 disabled:cursor-not-allowed ${
                  isActive
                    ? 'border-blue-500 bg-blue-950/40'
                    : 'border-slate-700 bg-slate-800/40 hover:border-slate-500 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span className="text-sm font-semibold text-slate-100">{tpl.name}</span>
                  {isActive && (
                    <span className="shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-xs font-medium text-white">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed mb-2">{tpl.description}</p>
                {CAPABILITY_TAGS[tpl.id] != null && (
                  <div className="flex flex-wrap gap-1">
                    {(CAPABILITY_TAGS[tpl.id] ?? []).map((tag) => (
                      <span key={tag} className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">{tag}</span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </SectionCard>

      {/* Widget zones — only for Classic template */}
      {activeId === 'classic' && (
        <SectionCard title="Widget Zones">
          <p className="text-xs text-slate-400 mb-4">
            Enable zones to add widgets around the calendar. Drag to reorder within each zone.
            {layoutSaved && <span className="ml-2 text-green-400">Saved ✓</span>}
          </p>
          <div className="space-y-3">
            <ZoneComposer
              title="Left Bar"
              description="Vertical sidebar on the left side of the calendar."
              widgets={sidebarWidgets}
              enabled={showSidebar}
              saving={saving}
              tiles={tiles}
              onToggleEnabled={() => void patchLayout({ showSidebar: !showSidebar })}
              onWidgetsChange={(next) => void patchLayout({ sidebarWidgets: next })}
            />
            <ZoneComposer
              title="Right Bar"
              description="Vertical sidebar on the right side of the calendar."
              widgets={rightBarWidgets}
              enabled={rightBarWidgets.length > 0}
              saving={saving}
              tiles={tiles}
              onToggleEnabled={() => void patchLayout({ rightBarWidgets: rightBarWidgets.length > 0 ? [] : ['clock'] })}
              onWidgetsChange={(next) => void patchLayout({ rightBarWidgets: next })}
            />
            <ZoneComposer
              title="Top Bar"
              description="Horizontal strip across the top of the display."
              widgets={topBarWidgets}
              enabled={topBarWidgets.length > 0}
              saving={saving}
              tiles={tiles}
              onToggleEnabled={() => void patchLayout({ topBarWidgets: topBarWidgets.length > 0 ? [] : ['clock'] })}
              onWidgetsChange={(next) => void patchLayout({ topBarWidgets: next })}
            />
            <ZoneComposer
              title="Bottom Bar"
              description="Horizontal strip across the bottom, above the news ticker."
              widgets={bottomBarWidgets}
              enabled={bottomBarWidgets.length > 0}
              saving={saving}
              tiles={tiles}
              onToggleEnabled={() => void patchLayout({ bottomBarWidgets: bottomBarWidgets.length > 0 ? [] : ['clock'] })}
              onWidgetsChange={(next) => void patchLayout({ bottomBarWidgets: next })}
            />
          </div>
        </SectionCard>
      )}

      {/* Calendar view mode — month grid vs. a rolling window centered on today */}
      <SectionCard title="Calendar View">
        <p className="text-xs text-slate-400 mb-3">
          Month always shows the current calendar month, so late in the month you can't see the
          start of next month. Rolling instead centers on today, so it never hides nearby days.
        </p>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {(['month', 'rolling'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              disabled={saving}
              onClick={() => void patchLayout({ calendarViewMode: mode })}
              className={`rounded-lg border-2 p-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${
                calendarViewMode === mode
                  ? 'border-blue-500 bg-blue-950/40'
                  : 'border-slate-700 bg-slate-800/40 hover:border-slate-500'
              }`}
            >
              <span className="block text-sm font-semibold text-slate-100 mb-1">
                {mode === 'month' ? 'Month' : 'Rolling'}
              </span>
              <span className="block text-xs text-slate-400 leading-snug">
                {mode === 'month' ? 'Fixed calendar month (default)' : 'Weeks centered on today'}
              </span>
            </button>
          ))}
        </div>
        {calendarViewMode === 'rolling' && (
          <div>
            <label htmlFor="rolling-weeks" className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
              Weeks to show
            </label>
            <input
              id="rolling-weeks"
              type="number"
              min={1}
              max={12}
              value={calendarRollingWeeks}
              disabled={saving}
              onChange={(e) => void patchLayout({ calendarRollingWeeks: Math.max(1, Math.min(12, parseInt(e.target.value, 10) || 1)) })}
              className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-slate-500 mt-1.5">Always centered on today's week — 4 weeks (default) shows about a month at a glance.</p>
          </div>
        )}
      </SectionCard>

      {/* Calendar size — only for Classic template */}
      {activeId === 'classic' && (
        <SectionCard title="Calendar Size">
          <p className="text-xs text-slate-400 mb-3">
            Controls how much space the calendar takes relative to widget zones.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {CALENDAR_SIZE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={saving}
                onClick={() => void patchLayout({ calendarSize: opt.value })}
                className={`rounded-lg border-2 p-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${
                  calendarSize === opt.value
                    ? 'border-blue-500 bg-blue-950/40'
                    : 'border-slate-700 bg-slate-800/40 hover:border-slate-500'
                }`}
              >
                <span className="block text-sm font-semibold text-slate-100 mb-1">{opt.label}</span>
                <span className="block text-xs text-slate-400 leading-snug">{opt.desc}</span>
              </button>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
