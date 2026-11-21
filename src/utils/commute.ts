import type { AirQualitySnapshot } from '../types/airQuality.ts';

export const COMMUTE_MODE_VALUES = [
  'walking',
  'cycling',
  'public_transit',
  'carpool',
  'private_car',
] as const;

export type CommuteMode = (typeof COMMUTE_MODE_VALUES)[number];

export const COMMUTE_TRAVEL_WINDOW_VALUES = [
  'early_morning',
  'morning_rush',
  'midday',
  'evening_rush',
  'night',
] as const;

export type CommuteTravelWindow = (typeof COMMUTE_TRAVEL_WINDOW_VALUES)[number];

export interface CommuteComparison {
  safeDistanceKm: number;
  mainRoadTimeMin: number;
  quietStreetTimeMin: number;
  transitTimeMin: number;
  arterialExposure: string;
  quietExposure: string;
  transitExposure: string;
  carCo2Range: [number, number];
  transitCo2Range: [number, number];
}

export function calculateCommuteComparison(params: {
  distanceKm: number;
  mode: CommuteMode;
  travelTime: CommuteTravelWindow;
  hasSnapshot: boolean;
  isHighAqi: boolean;
}): CommuteComparison {
  const safeDistanceKm =
    Number.isFinite(params.distanceKm) && params.distanceKm >= 0.5 && params.distanceKm <= 100
      ? params.distanceKm
      : 1;

  const rushMultiplier =
    params.travelTime === 'morning_rush' || params.travelTime === 'evening_rush' ? 1.25 : 1.0;

  const transitTimeMin = Math.round(safeDistanceKm * 3.2 + 8);
  const mainRoadTimeMin =
    params.mode === 'walking'
      ? Math.round(safeDistanceKm * 12)
      : params.mode === 'cycling'
      ? Math.round(safeDistanceKm * 4)
      : params.mode === 'public_transit'
      ? transitTimeMin
      : Math.round(safeDistanceKm * 2.8 * rushMultiplier);

  const quietStreetTimeMin =
    params.mode === 'walking' || params.mode === 'cycling'
      ? Math.round(mainRoadTimeMin * 1.12)
      : Math.round(mainRoadTimeMin * 1.08);

  const arterialExposure = !params.hasSnapshot
    ? 'Select a city or Demo Mode to pair roadside exposure with live/demo AQI'
    : params.mode === 'walking' || params.mode === 'cycling'
    ? params.isHighAqi
      ? 'High (unfiltered roadside breathing + heavy exhaust proximity)'
      : 'Moderate-Elevated (close to arterial tailpipe emissions)'
    : 'Moderate (cabin air mixes with heavy road exhaust)';

  const quietExposure = !params.hasSnapshot
    ? 'Quiet side streets generally reduce direct diesel exhaust proximity'
    : params.mode === 'walking' || params.mode === 'cycling'
    ? params.isHighAqi
      ? 'Elevated (quieter streets reduce tailpipe NO₂, though ambient PM2.5 remains high)'
      : 'Lower relative roadside exposure (set back from diesel traffic)'
    : 'Lower relative exposure (reduces stop-and-go exhaust queuing)';

  const transitExposure = !params.hasSnapshot
    ? 'Lower per-passenger emissions; select a city for ambient mask guidance'
    : params.isHighAqi
    ? 'Moderate (enclosed transit reduces windborne dust; wear N95/FFP2 during platform walks)'
    : 'Lower personal exposure & lower per-passenger emissions';

  const carCo2Range: [number, number] = [
    Math.round(safeDistanceKm * 0.16 * 10) / 10,
    Math.round(safeDistanceKm * 0.22 * 10) / 10,
  ];
  const transitCo2Range: [number, number] = [
    Math.round(safeDistanceKm * 0.04 * 10) / 10,
    Math.round(safeDistanceKm * 0.09 * 10) / 10,
  ];

  return {
    safeDistanceKm,
    mainRoadTimeMin,
    quietStreetTimeMin,
    transitTimeMin,
    arterialExposure,
    quietExposure,
    transitExposure,
    carCo2Range,
    transitCo2Range,
  };
}

export function getCommuteTimingAdvice(params: {
  isHighAqi: boolean;
  travelTime: CommuteTravelWindow;
  snapshot: AirQualitySnapshot | null;
}): string {
  if (params.isHighAqi || (params.snapshot?.currentUsAqi ?? 0) > 150) {
    return 'Because outdoor AQI is above 150, prolonged outdoor cycling or brisk walking increases breathing volume significantly. Consider enclosed public transit or carpool and wear a well-fitted N95/FFP2 respirator during outdoor segments.';
  }
  if (params.travelTime === 'morning_rush' || params.travelTime === 'evening_rush') {
    return 'Rush-hour traffic raises street-level NO₂ and brake/exhaust particles. If using a car, engage cabin air recirculation at congested junctions; if walking, choose parallel tree-lined streets.';
  }
  return 'Midday off-peak travel generally encounters lighter traffic queues and stronger atmospheric mixing than rush hours.';
}
