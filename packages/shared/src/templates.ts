export type LayoutId = 'classic' | 'minimal' | 'photo-focus';

export interface Template {
  id: LayoutId;
  name: string;
  description: string;
}
