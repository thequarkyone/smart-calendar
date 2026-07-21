import type { WeatherState } from '@smart-display/shared';
import type { SettingsService } from './settings.js';
import type { EventBus } from '../event-bus.js';

/**
 * Schedules automatic theme switching at sunrise/sunset when autoTheme is enabled.
 * Reads sunrise/sunset from the latest weather state and sets timeouts accordingly.
 * Call schedule() whenever a new weather state arrives or settings change.
 */
export class ThemeScheduler {
  private sunriseTimer: ReturnType<typeof setTimeout> | null = null;
  private sunsetTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly settings: SettingsService,
    private readonly bus: EventBus,
  ) {}

  schedule(weather: WeatherState): void {
    this.clearTimers();
    const s = this.settings.get();
    if (!s.autoTheme) return;

    const today = weather.daily[0];
    if (!today?.sunrise || !today?.sunset) return;

    const now = Date.now();
    const sunriseMs = new Date(today.sunrise).getTime();
    const sunsetMs = new Date(today.sunset).getTime();

    if (sunriseMs > now) {
      this.sunriseTimer = setTimeout(() => {
        if (!this.settings.get().autoTheme) return;
        const updated = this.settings.update({ theme: 'light' });
        this.bus.emit('settings:changed', updated);
      }, sunriseMs - now);
    }

    if (sunsetMs > now) {
      this.sunsetTimer = setTimeout(() => {
        if (!this.settings.get().autoTheme) return;
        const updated = this.settings.update({ theme: 'dark' });
        this.bus.emit('settings:changed', updated);
      }, sunsetMs - now);
    }
  }

  clearTimers(): void {
    if (this.sunriseTimer !== null) { clearTimeout(this.sunriseTimer); this.sunriseTimer = null; }
    if (this.sunsetTimer !== null) { clearTimeout(this.sunsetTimer); this.sunsetTimer = null; }
  }
}
