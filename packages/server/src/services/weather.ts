import type Database from 'better-sqlite3';
import type { WeatherState } from '@smart-display/shared';

/**
 * Open-Meteo with `timezone=auto` returns time strings in the location's local time WITHOUT an
 * offset (e.g. "2026-07-08T14:00"). `new Date(...)` would then parse them in the *process's* own
 * timezone (UTC on a default Pi image), producing instants that are wrong by the location's UTC
 * offset — breaking the "next 24h" hourly filter and the sunrise/sunset theme timers. We take the
 * `utc_offset_seconds` the API returns and append it so every string is an unambiguous instant that
 * parses identically on the server and in the kiosk browser. Date-only strings ("2026-07-08") are
 * left untouched.
 */
function offsetSuffix(utcOffsetSeconds: number): string {
  const sign = utcOffsetSeconds < 0 ? '-' : '+';
  const abs = Math.abs(utcOffsetSeconds);
  const hh = String(Math.floor(abs / 3600)).padStart(2, '0');
  const mm = String(Math.floor((abs % 3600) / 60)).padStart(2, '0');
  return `${sign}${hh}:${mm}`;
}

function absolutize(localTime: string | undefined, suffix: string): string | undefined {
  if (!localTime) return localTime;
  // Only append to date-time strings (contain 'T'); leave date-only strings alone.
  return localTime.includes('T') ? `${localTime}${suffix}` : localTime;
}

export class WeatherService {
  private cached: WeatherState = { current: null, hourly: [], daily: [], updatedAt: null };

  constructor(private readonly db: Database.Database) {}

  getState(): WeatherState {
    return this.cached;
  }

  async fetch(lat: number, lon: number, units: 'metric' | 'imperial'): Promise<WeatherState> {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      current: 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day',
      hourly: 'temperature_2m,weather_code',
      daily: 'temperature_2m_max,temperature_2m_min,weather_code,sunrise,sunset,precipitation_probability_max',
      timezone: 'auto',
      forecast_days: '7',
      wind_speed_unit: units === 'imperial' ? 'mph' : 'kmh',
    });

    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Open-Meteo error: ${res.status}`);

    const MAX_BYTES = 1 * 1024 * 1024; // 1 MB cap — weather payload is always small
    const reader = res.body?.getReader();
    if (!reader) throw new Error('Empty response body from Open-Meteo');
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > MAX_BYTES) {
          await reader.cancel();
          throw new Error('Open-Meteo response exceeded size limit');
        }
        chunks.push(value);
      }
    }
    const data = JSON.parse(Buffer.from(
      chunks.reduce((acc, c) => { const r = new Uint8Array(acc.length + c.length); r.set(acc); r.set(c, acc.length); return r; }, new Uint8Array(0))
    ).toString('utf-8')) as {
      utc_offset_seconds: number;
      current: {
        temperature_2m: number;
        apparent_temperature: number;
        relative_humidity_2m: number;
        wind_speed_10m: number;
        weather_code: number;
        is_day: number;
      };
      hourly: {
        time: string[];
        temperature_2m: number[];
        weather_code: number[];
      };
      daily: {
        time: string[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        weather_code: number[];
        sunrise: string[];
        sunset: string[];
        precipitation_probability_max?: number[];
      };
    };

    const now = new Date();
    const next24 = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const suffix = offsetSuffix(data.utc_offset_seconds ?? 0);

    const hourlyLen = Math.min(
      data.hourly.time.length,
      data.hourly.temperature_2m.length,
      data.hourly.weather_code.length,
    );
    const hourly = data.hourly.time
      .slice(0, hourlyLen)
      .map((t, i) => ({
        time: absolutize(t, suffix) ?? t,
        tempC: data.hourly.temperature_2m[i] ?? 0,
        conditionCode: data.hourly.weather_code[i] ?? 0,
      }))
      .filter((h) => {
        const d = new Date(h.time);
        return d >= now && d <= next24;
      });

    const dailyLen = Math.min(
      data.daily.time.length,
      data.daily.temperature_2m_max.length,
      data.daily.temperature_2m_min.length,
      data.daily.weather_code.length,
    );
    const daily = data.daily.time
      .slice(0, dailyLen)
      .map((date, i) => ({
        date,
        maxTempC: data.daily.temperature_2m_max[i] ?? 0,
        minTempC: data.daily.temperature_2m_min[i] ?? 0,
        conditionCode: data.daily.weather_code[i] ?? 0,
        sunrise: absolutize(data.daily.sunrise[i], suffix),
        sunset: absolutize(data.daily.sunset[i], suffix),
        precipitationProbabilityMax: data.daily.precipitation_probability_max?.[i],
      }));

    this.cached = {
      current: {
        tempC: data.current.temperature_2m,
        feelsLikeC: data.current.apparent_temperature,
        humidity: data.current.relative_humidity_2m,
        windKph: data.current.wind_speed_10m,
        conditionCode: data.current.weather_code,
        isDay: data.current.is_day === 1,
      },
      hourly,
      daily,
      updatedAt: new Date().toISOString(),
    };

    return this.cached;
  }
}
