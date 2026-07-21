export interface WeatherCurrent {
  tempC: number;
  feelsLikeC: number;
  humidity: number;
  windKph: number;
  conditionCode: number;
  isDay: boolean;
}
export interface WeatherHourly {
  time: string;
  tempC: number;
  conditionCode: number;
}
export interface WeatherDaily {
  date: string;
  maxTempC: number;
  minTempC: number;
  conditionCode: number;
  sunrise?: string;
  sunset?: string;
  precipitationProbabilityMax?: number;
}
export interface WeatherState {
  current: WeatherCurrent | null;
  hourly: WeatherHourly[];
  daily: WeatherDaily[];
  updatedAt: string | null;
}
