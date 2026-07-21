import type { LayoutId } from '@smart-display/shared';
import type { LayoutConfig } from '@smart-display/shared';

export interface LayoutPreset {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  icon: string;
  patch: {
    activeTemplateId: LayoutId;
    layoutConfig: Partial<LayoutConfig>;
  };
}

export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    id: 'family-hub',
    name: 'Family Hub',
    description: 'Everything at a glance — clock, weather, tasks, and a full month calendar.',
    capabilities: ['Sidebar', 'Calendar', 'Photos', 'Tasks'],
    icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
    patch: {
      activeTemplateId: 'classic',
      layoutConfig: {
        showSidebar: true,
        sidebarWidth: 380,
        photoStripHeight: 140,
        newsBandHeight: 48,
        sidebarWidgets: ['clock', 'weather', 'tasks', 'home_assistant'],
      },
    },
  },
  {
    id: 'minimal-clock',
    name: 'Minimal Clock',
    description: 'Just clock and calendar — clean, distraction-free, easy to read across the room.',
    capabilities: ['Clock', 'Calendar only'],
    icon: 'M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 5v5l3 3',
    patch: {
      activeTemplateId: 'minimal',
      layoutConfig: {
        showSidebar: false,
        sidebarWidth: 380,
        photoStripHeight: 0,
        newsBandHeight: 0,
        sidebarWidgets: ['clock', 'calendar'],
      },
    },
  },
  {
    id: 'photo-frame',
    name: 'Photo Frame',
    description: 'Full-screen photos with a clock and weather overlay. Looks great as a digital art frame.',
    capabilities: ['Full-bleed photos', 'Clock overlay', 'Weather'],
    icon: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z M4 22v-7',
    patch: {
      activeTemplateId: 'photo-focus',
      layoutConfig: {
        showSidebar: false,
        sidebarWidth: 380,
        photoStripHeight: 200,
        newsBandHeight: 48,
        sidebarWidgets: ['clock', 'weather'],
      },
    },
  },
  {
    id: 'news-board',
    name: 'News Board',
    description: 'Calendar front-and-centre with weather, Home Assistant status, and a live news ticker.',
    capabilities: ['Sidebar', 'Calendar', 'News ticker', 'Smart home'],
    icon: 'M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2 M18 14h-8 M15 18h-5 M10 6h8v4h-8V6z',
    patch: {
      activeTemplateId: 'classic',
      layoutConfig: {
        showSidebar: true,
        sidebarWidth: 340,
        photoStripHeight: 80,
        newsBandHeight: 64,
        sidebarWidgets: ['clock', 'weather', 'home_assistant'],
        rightBarWidgets: [],
        topBarWidgets: [],
        bottomBarWidgets: [],
        calendarSize: 'large',
      },
    },
  },
  {
    id: 'calendar-focus',
    name: 'Calendar Focus',
    description: 'Maximum calendar — no sidebars, full-width display for households that live by their schedule.',
    capabilities: ['Full-width calendar'],
    icon: 'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
    patch: {
      activeTemplateId: 'classic',
      layoutConfig: {
        showSidebar: false,
        sidebarWidth: 380,
        photoStripHeight: 0,
        newsBandHeight: 0,
        sidebarWidgets: [],
        rightBarWidgets: [],
        topBarWidgets: [],
        bottomBarWidgets: [],
        calendarSize: 'full',
      },
    },
  },
  {
    id: 'ha-dashboard',
    name: 'HA Dashboard',
    description: 'Right bar packed with Home Assistant controls and a small calendar for a quick date glance.',
    capabilities: ['Right bar', 'Smart home', 'Small calendar'],
    icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M10 22V12h4v10',
    patch: {
      activeTemplateId: 'classic',
      layoutConfig: {
        showSidebar: false,
        sidebarWidth: 380,
        photoStripHeight: 0,
        newsBandHeight: 0,
        sidebarWidgets: [],
        rightBarWidgets: ['home_assistant', 'clock', 'weather'],
        rightBarWidth: 360,
        topBarWidgets: [],
        bottomBarWidgets: [],
        calendarSize: 'small',
      },
    },
  },
  {
    id: 'info-board',
    name: 'Info Board',
    description: 'Clock and weather in a top strip with tasks and news in the sidebar — ideal for an office or kitchen.',
    capabilities: ['Top bar', 'Sidebar', 'Calendar', 'Tasks'],
    icon: 'M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z M13 2v7h7',
    patch: {
      activeTemplateId: 'classic',
      layoutConfig: {
        showSidebar: true,
        sidebarWidth: 340,
        photoStripHeight: 0,
        newsBandHeight: 48,
        sidebarWidgets: ['tasks', 'today_agenda'],
        rightBarWidgets: [],
        topBarWidgets: ['clock', 'weather'],
        topBarHeight: 90,
        bottomBarWidgets: [],
        calendarSize: 'large',
      },
    },
  },
  {
    id: 'morning-brief',
    name: 'Morning Brief',
    description: "Today's agenda and Spotify across the bottom, with clock and weather in the sidebar.",
    capabilities: ['Bottom bar', 'Sidebar', 'Agenda', 'Spotify'],
    icon: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z',
    patch: {
      activeTemplateId: 'classic',
      layoutConfig: {
        showSidebar: true,
        sidebarWidth: 320,
        photoStripHeight: 0,
        newsBandHeight: 0,
        sidebarWidgets: ['clock', 'weather'],
        rightBarWidgets: [],
        topBarWidgets: [],
        bottomBarWidgets: ['today_agenda', 'spotify'],
        bottomBarHeight: 100,
        calendarSize: 'large',
      },
    },
  },
];
