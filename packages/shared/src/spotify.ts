export interface SpotifyTrack {
  title: string;
  artist: string;
  albumArt: string | null;
  progressMs: number;
  durationMs: number;
  isPlaying: boolean;
}

export interface SpotifyState {
  credentialsSet: boolean;
  connected: boolean;
  playing: boolean;
  track: SpotifyTrack | null;
  error: string | null;
}
