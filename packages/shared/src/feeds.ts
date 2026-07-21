export interface FeedSource {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  maxItems: number;
}

/** Wire-safe DTO — URL omitted, replaced by a boolean flag */
export interface FeedSourcePublic {
  id: string;
  name: string;
  urlSet: boolean;
  enabled: boolean;
  maxItems: number;
}
export interface FeedItem {
  feedId: string;
  title: string;
  link: string;
  pubDate: string | null;
  description: string | null;
}
export interface FeedsState {
  sources: FeedSourcePublic[];
  items: FeedItem[];
}
