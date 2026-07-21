export type UpdateChannel = 'stable' | 'beta';

export interface SystemInfo {
  appVersion: string;
  updateChannel: UpdateChannel;
  deviceName: string;
  onboardingComplete: boolean;
}
