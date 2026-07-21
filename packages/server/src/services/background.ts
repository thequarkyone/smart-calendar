import { createWriteStream, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { resolve, sep, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { BackgroundSource, BackgroundState } from '@smart-display/shared';
import type { SecretsService } from './secrets.js';

const NASA_APOD_URL = 'https://api.nasa.gov/planetary/apod';
const UNSPLASH_URL = 'https://api.unsplash.com/photos/random';
const PEXELS_URL = 'https://api.pexels.com/v1/search';
const NASA_DEMO_KEY = 'DEMO_KEY';

const MAX_JSON_BYTES = 512 * 1024; // API metadata responses are always small
const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20 MB — generous for a full-res nature photo
const FETCH_TIMEOUT_MS = 20_000;

async function readCapped(res: Response, maxBytes: number): Promise<Buffer> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error('Empty response body');
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error('Response exceeded size limit');
      }
      chunks.push(value);
    }
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

interface FetchedImage {
  imageUrl: string;
  attribution: string | null;
}

async function fetchNasaApod(secrets: SecretsService): Promise<FetchedImage> {
  const apiKey = secrets.get('nasa_api_key') ?? NASA_DEMO_KEY;
  const params = new URLSearchParams({ api_key: apiKey, thumbs: 'true' });
  const res = await fetch(`${NASA_APOD_URL}?${params.toString()}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`NASA APOD error: ${res.status}`);
  const body = await readCapped(res, MAX_JSON_BYTES);
  const data = JSON.parse(body.toString('utf-8')) as {
    media_type: string;
    url: string;
    hdurl?: string;
    title?: string;
    copyright?: string;
    thumbnail_url?: string;
  };
  // Some days' APOD is a video, not a photo — fall back to its thumbnail if present, else fail
  // so the caller keeps yesterday's cached image rather than showing nothing.
  const imageUrl = data.media_type === 'image' ? (data.hdurl ?? data.url) : data.thumbnail_url;
  if (!imageUrl) throw new Error('NASA APOD: no image available for today (video with no thumbnail)');
  const credit = data.copyright ? `${data.copyright.trim()} — NASA APOD` : 'NASA Astronomy Picture of the Day';
  return { imageUrl, attribution: data.title ? `${data.title} · ${credit}` : credit };
}

async function fetchUnsplash(secrets: SecretsService): Promise<FetchedImage> {
  const apiKey = secrets.get('unsplash_api_key');
  if (!apiKey) throw new Error('Unsplash API key not configured');
  const params = new URLSearchParams({ query: 'nature landscape', orientation: 'landscape' });
  const res = await fetch(`${UNSPLASH_URL}?${params.toString()}`, {
    headers: { Authorization: `Client-ID ${apiKey}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Unsplash error: ${res.status}`);
  const body = await readCapped(res, MAX_JSON_BYTES);
  const data = JSON.parse(body.toString('utf-8')) as {
    urls: { full: string; regular: string };
    user: { name: string; links: { html: string } };
  };
  return { imageUrl: data.urls.regular, attribution: `Photo by ${data.user.name} on Unsplash` };
}

async function fetchPexels(secrets: SecretsService): Promise<FetchedImage> {
  const apiKey = secrets.get('pexels_api_key');
  if (!apiKey) throw new Error('Pexels API key not configured');
  // Vary the page daily so the same handful of top "nature" results aren't shown every day.
  const page = 1 + (new Date().getDate() % 20);
  const params = new URLSearchParams({ query: 'nature landscape', orientation: 'landscape', per_page: '1', page: String(page) });
  const res = await fetch(`${PEXELS_URL}?${params.toString()}`, {
    headers: { Authorization: apiKey },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Pexels error: ${res.status}`);
  const body = await readCapped(res, MAX_JSON_BYTES);
  const data = JSON.parse(body.toString('utf-8')) as {
    photos: Array<{ src: { large2x: string }; photographer: string }>;
  };
  const photo = data.photos[0];
  if (!photo) throw new Error('Pexels: no results');
  return { imageUrl: photo.src.large2x, attribution: `Photo by ${photo.photographer} on Pexels` };
}

const FETCHERS: Record<BackgroundSource, (secrets: SecretsService) => Promise<FetchedImage>> = {
  nasa: fetchNasaApod,
  unsplash: fetchUnsplash,
  pexels: fetchPexels,
};

export class BackgroundService {
  private state: BackgroundState = { imageUrl: null, source: null, attribution: null, updatedAt: null };
  private readonly baseDir: string;
  private readonly imagePath: string;

  constructor(private readonly secrets: SecretsService, dataDir: string) {
    this.baseDir = resolve(join(dataDir, 'background'));
    this.imagePath = join(this.baseDir, 'current');
  }

  getState(): BackgroundState {
    return this.state;
  }

  getImagePath(): string | null {
    return this.state.imageUrl && existsSync(this.imagePath) ? this.imagePath : null;
  }

  /** Fetches today's image for the given source and caches it to disk. Throws on failure —
   * caller decides whether to keep the previously-cached image or surface the error. */
  async refresh(source: BackgroundSource): Promise<BackgroundState> {
    const fetcher = FETCHERS[source];
    const { imageUrl, attribution } = await fetcher(this.secrets);

    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!imgRes.ok) throw new Error(`Image download error: ${imgRes.status}`);
    const imageBuf = await readCapped(imgRes, MAX_IMAGE_BYTES);

    mkdirSync(this.baseDir, { recursive: true });
    const resolvedDest = resolve(this.imagePath);
    if (!resolvedDest.startsWith(this.baseDir + sep) && resolvedDest !== this.baseDir) {
      throw new Error('invalid background image destination path');
    }
    const tmpPath = `${resolvedDest}.tmp`;
    await pipeline(Readable.from(imageBuf), createWriteStream(tmpPath));
    try { unlinkSync(resolvedDest); } catch { /* no previous file */ }
    const { renameSync } = await import('node:fs');
    renameSync(tmpPath, resolvedDest);

    this.state = {
      imageUrl: '/api/background/current',
      source,
      attribution,
      updatedAt: new Date().toISOString(),
    };
    return this.state;
  }
}
