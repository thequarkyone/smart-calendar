export interface PhotoSource {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
}
export interface PhotoState {
  sources: PhotoSource[];
  currentPhoto: string | null;
  totalCount: number;
}
