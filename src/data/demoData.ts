import type {
  AirQualitySnapshot,
  CommunityInitiative,
  ExposureLogEntry,
  GridStationPoint,
  IndoorHomeProfile,
  SustainabilityGoal,
  TrendPoint,
} from '../types/airQuality.ts';
import {
  buildPollutantReadings,
  determinePrimaryPollutant,
  generateAlertsFromData,
} from '../utils/aqi.ts';

function buildDemoHourly(baseAqi: number, basePm25: number, basePm10: number): TrendPoint[] {
  const now = new Date();
  const points: TrendPoint[] = [];
  for (let i = 23; i >= 0; i--) {
    const dt = new Date(now.getTime() - i * 3600 * 1000);
    const hour = dt.getHours();
    // Realistic diurnal urban curve: morning peak (~8am), midday dip (~14pm), evening accumulation (~21pm)
    const diurnalFactor =
      hour >= 7 && hour <= 10
        ? 1.15
        : hour >= 13 && hour <= 16
        ? 0.82
        : hour >= 19 && hour <= 23
        ? 1.2
        : 0.95;
    const wave = Math.sin(i * 0.55) * 0.06;
    const factor = diurnalFactor + wave;
    points.push({
      timestamp: dt.toISOString(),
      label: dt.toLocaleTimeString([], { hour: 'numeric', hour12: true }),
      usAqi: Math.max(12, Math.round(baseAqi * factor)),
      eaqi: Math.max(8, Math.round((baseAqi / 2.6) * factor)),
      pm2_5: Math.round(basePm25 * factor * 10) / 10,
      pm10: Math.round(basePm10 * factor * 10) / 10,
      no2: Math.round(28 * factor * 10) / 10,
      o3: Math.round((hour >= 12 && hour <= 17 ? 74 : 38) * 10) / 10,
    });
  }
  return points;
}

function buildDemoDays(count: number, baseAqi: number, basePm25: number, basePm10: number): TrendPoint[] {
  const now = new Date();
  const points: TrendPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const dt = new Date(now.getTime() - i * 86400 * 1000);
    const factor = 0.85 + ((Math.sin(i * 0.9) + 1) / 2) * 0.32;
    points.push({
      timestamp: dt.toISOString(),
      label: dt.toLocaleDateString([], { month: 'short', day: 'numeric' }),
      usAqi: Math.max(15, Math.round(baseAqi * factor)),
      eaqi: Math.max(10, Math.round((baseAqi / 2.6) * factor)),
      pm2_5: Math.round(basePm25 * factor * 10) / 10,
      pm10: Math.round(basePm10 * factor * 10) / 10,
      no2: Math.round(32 * factor * 10) / 10,
      o3: Math.round(52 * factor * 10) / 10,
    });
  }
  return points;
}

export interface DemoCityPreset {
  key: string;
  label: string;
  snapshot: AirQualitySnapshot;
}

function createDemoSnapshot(params: {
  id: string;
  name: string;
  admin1: string;
  country: string;
  latitude: number;
  longitude: number;
  usAqi: number;
  eaqi: number;
  pm2_5: number;
  pm10: number;
  no2: number;
  o3: number;
  so2: number;
  co: number;
  tempC: number;
  humidity: number;
  windKmh: number;
}): AirQualitySnapshot {
  const pollutants = buildPollutantReadings({
    pm2_5: params.pm2_5,
    pm10: params.pm10,
    no2: params.no2,
    o3: params.o3,
    so2: params.so2,
    co: params.co,
  });
  const hourly24h = buildDemoHourly(params.usAqi, params.pm2_5, params.pm10);
  const daily7d = buildDemoDays(7, params.usAqi, params.pm2_5, params.pm10);
  const sample30dTrend = buildDemoDays(30, params.usAqi, params.pm2_5, params.pm10);
  const nowIso = new Date().toISOString();

  return {
    location: {
      id: params.id,
      name: params.name,
      admin1: params.admin1,
      country: params.country,
      latitude: params.latitude,
      longitude: params.longitude,
      timezone: 'auto',
    },
    isDemo: true,
    dataSource: 'BreatheWise Demonstration Dataset (Simulated)',
    attribution: 'DEMO DATA — NOT LIVE ENVIRONMENTAL MEASUREMENTS',
    currentUsAqi: params.usAqi,
    currentEaqi: params.eaqi,
    primaryPollutant: determinePrimaryPollutant(pollutants),
    lastUpdatedIso: nowIso,
    fetchedAtIso: nowIso,
    freshnessStatus: 'demo',
    freshnessLabel: 'Demonstration scenario (illustrative)',
    pollutants,
    weather: {
      temperatureC: params.tempC,
      humidityPercent: params.humidity,
      windSpeedKmh: params.windKmh,
      surfacePressureHpa: 1015,
      observedAt: nowIso,
    },
    hourly24h,
    daily7d,
    historical30dAvailable: false,
    historical30dNote:
      'Sample 30-day illustrative baseline shown for demonstration purposes.',
    sample30dTrend,
    alerts: generateAlertsFromData({
      usAqi: params.usAqi,
      hourly24h,
      windSpeedKmh: params.windKmh,
      isDemo: true,
    }),
  };
}

export const DEMO_SCENARIOS: DemoCityPreset[] = [
  {
    key: 'demo-delhi',
    label: 'New Delhi — Winter Smog Demo (AQI 268)',
    snapshot: createDemoSnapshot({
      id: 'demo-delhi',
      name: 'New Delhi (Demo)',
      admin1: 'Delhi NCR',
      country: 'India',
      latitude: 28.6139,
      longitude: 77.209,
      usAqi: 268,
      eaqi: 96,
      pm2_5: 192.4,
      pm10: 278.0,
      no2: 64.2,
      o3: 44.5,
      so2: 18.6,
      co: 1420,
      tempC: 14.2,
      humidity: 74,
      windKmh: 4.1,
    }),
  },
  {
    key: 'demo-bengaluru',
    label: 'Bengaluru — Elevated Traffic Demo (AQI 124)',
    snapshot: createDemoSnapshot({
      id: 'demo-bengaluru',
      name: 'Bengaluru (Demo)',
      admin1: 'Karnataka',
      country: 'India',
      latitude: 12.9716,
      longitude: 77.5946,
      usAqi: 124,
      eaqi: 52,
      pm2_5: 44.8,
      pm10: 76.2,
      no2: 41.0,
      o3: 68.4,
      so2: 11.2,
      co: 680,
      tempC: 23.8,
      humidity: 61,
      windKmh: 9.4,
    }),
  },
  {
    key: 'demo-london',
    label: 'London — Moderate Commute Demo (AQI 76)',
    snapshot: createDemoSnapshot({
      id: 'demo-london',
      name: 'London (Demo)',
      admin1: 'Greater London',
      country: 'United Kingdom',
      latitude: 51.5074,
      longitude: -0.1278,
      usAqi: 76,
      eaqi: 34,
      pm2_5: 21.6,
      pm10: 34.5,
      no2: 33.8,
      o3: 54.0,
      so2: 6.4,
      co: 390,
      tempC: 11.4,
      humidity: 78,
      windKmh: 14.6,
    }),
  },
  {
    key: 'demo-zurich',
    label: 'Zurich — Clean Air Demo (AQI 28)',
    snapshot: createDemoSnapshot({
      id: 'demo-zurich',
      name: 'Zurich (Demo)',
      admin1: 'Zurich',
      country: 'Switzerland',
      latitude: 47.3769,
      longitude: 8.5417,
      usAqi: 28,
      eaqi: 14,
      pm2_5: 6.2,
      pm10: 12.1,
      no2: 13.5,
      o3: 48.2,
      so2: 2.1,
      co: 210,
      tempC: 9.8,
      humidity: 66,
      windKmh: 16.2,
    }),
  },
];

export function buildDemoGridStations(snapshot: AirQualitySnapshot): GridStationPoint[] {
  const baseAqi = snapshot.currentUsAqi ?? 80;
  const basePm25 = snapshot.pollutants.find((p) => p.code === 'pm2_5')?.value ?? 25;
  const basePm10 = snapshot.pollutants.find((p) => p.code === 'pm10')?.value ?? 42;
  const baseNo2 = snapshot.pollutants.find((p) => p.code === 'no2')?.value ?? 28;
  const offsets: Array<{ dir: string; label: string; dLat: number; dLon: number; km: number; mult: number }> = [
    { dir: 'Center', label: `${snapshot.location.name} Central`, dLat: 0, dLon: 0, km: 0, mult: 1.0 },
    { dir: 'N', label: 'North Residential Belt', dLat: 0.08, dLon: 0, km: 9, mult: 0.92 },
    { dir: 'NE', label: 'NE Green Corridor', dLat: 0.06, dLon: 0.07, km: 10, mult: 0.84 },
    { dir: 'E', label: 'East Transit Hub', dLat: 0, dLon: 0.09, km: 10, mult: 1.12 },
    { dir: 'SE', label: 'SE Industrial Ring', dLat: -0.07, dLon: 0.07, km: 11, mult: 1.18 },
    { dir: 'S', label: 'South Suburb', dLat: -0.08, dLon: 0, km: 9, mult: 0.95 },
    { dir: 'SW', label: 'SW Parkland Sector', dLat: -0.06, dLon: -0.07, km: 10, mult: 0.81 },
    { dir: 'W', label: 'West Arterial Highway', dLat: 0, dLon: -0.09, km: 10, mult: 1.09 },
    { dir: 'NW', label: 'NW University Zone', dLat: 0.06, dLon: -0.07, km: 10, mult: 0.89 },
  ];

  return offsets.map((o, idx) => ({
    id: `demo-grid-${idx}`,
    label: o.label,
    direction: o.dir,
    distanceKm: o.km,
    latitude: Math.round((snapshot.location.latitude + o.dLat) * 1000) / 1000,
    longitude: Math.round((snapshot.location.longitude + o.dLon) * 1000) / 1000,
    usAqi: Math.round(baseAqi * o.mult),
    eaqi: Math.round((baseAqi / 2.6) * o.mult),
    pm2_5: Math.round(basePm25 * o.mult * 10) / 10,
    pm10: Math.round(basePm10 * o.mult * 10) / 10,
    no2: Math.round(baseNo2 * o.mult * 10) / 10,
    dominantPollutant: snapshot.primaryPollutant ?? 'pm2_5',
  }));
}

export const DEFAULT_INDOOR_PROFILE: IndoorHomeProfile = {
  homeType: 'apartment',
  rooms: 3,
  sizeSqFt: 1100,
  ventilationType: 'natural_windows',
  hasPurifier: false,
  filterType: 'none',
  cookingMethod: 'piped_gas',
  hasPets: false,
  indoorSmokeExposure: false,
  dustLevel: 'moderate',
  humidityLevel: 'comfortable',
  budgetTier: '2000',
};

export const INITIAL_SUSTAINABILITY_GOALS: SustainabilityGoal[] = [
  {
    id: 'goal-walk-short',
    title: 'Walk or cycle for short trips under 2 km',
    category: 'transportation',
    difficulty: 'easy',
    cadence: 'weekly',
    targetCount: 4,
    completedCount: 1,
    pointsPerAction: 25,
    estimatedCo2RangeKg: [0.32, 0.45],
    methodologyNote:
      'Assumes replacing a 2 km passenger car trip (~160–225 g CO2e/km average urban tailpipe estimate).',
  },
  {
    id: 'goal-public-transit',
    title: 'Choose metro, bus, or carpool instead of solo driving',
    category: 'transportation',
    difficulty: 'moderate',
    cadence: 'weekly',
    targetCount: 3,
    completedCount: 1,
    pointsPerAction: 35,
    estimatedCo2RangeKg: [0.8, 1.5],
    methodologyNote:
      'Assumes an 8–10 km urban commute shifting from single-occupancy car to shared transit.',
  },
  {
    id: 'goal-no-idling',
    title: 'Switch off engine during stops longer than 30 seconds',
    category: 'outdoor',
    difficulty: 'easy',
    cadence: 'daily',
    targetCount: 5,
    completedCount: 2,
    pointsPerAction: 15,
    estimatedCo2RangeKg: [0.08, 0.15],
    methodologyNote:
      'Directional estimate based on reduced stationary fuel burn (~0.6–1.2 L/hour idling range).',
  },
  {
    id: 'goal-clean-cooking',
    title: 'Use lids on pots & run exhaust ventilation while cooking',
    category: 'cooking',
    difficulty: 'easy',
    cadence: 'daily',
    targetCount: 7,
    completedCount: 3,
    pointsPerAction: 15,
    estimatedCo2RangeKg: [0.05, 0.12],
    methodologyNote:
      'Reduces cooking fuel energy (~10–20% shorter simmer time) and lowers indoor particulate buildup.',
  },
  {
    id: 'goal-appliance-standby',
    title: 'Power down unused cooling/heating & standby loads',
    category: 'energy',
    difficulty: 'easy',
    cadence: 'weekly',
    targetCount: 5,
    completedCount: 2,
    pointsPerAction: 20,
    estimatedCo2RangeKg: [0.15, 0.35],
    methodologyNote:
      'Depends on regional grid electricity emission intensity; qualitative energy savings always positive.',
  },
  {
    id: 'goal-reusable',
    title: 'Carry reusable bags/bottles & avoid open waste burning',
    category: 'waste',
    difficulty: 'moderate',
    cadence: 'weekly',
    targetCount: 4,
    completedCount: 1,
    pointsPerAction: 20,
    estimatedCo2RangeKg: [0.1, 0.25],
    methodologyNote:
      'Avoids single-use plastic lifecycle waste and discourages local trash incineration.',
  },
];

export const INITIAL_COMMUNITY_INITIATIVES: CommunityInitiative[] = [
  {
    id: 'comm-walking-bus',
    title: 'Neighborhood Morning Walking & Low-Exposure School Transit',
    category: 'walking_bus',
    neighborhood: 'Local Sample Initiative',
    description:
      'Coordinate parent-led walking groups on shaded interior streets when morning AQI is under 100, and shared carpools when AQI rises.',
    participantsCount: 1,
    joinedByMe: true,
    checklist: [
      { id: 'c1', label: 'Map quiet side streets away from bus corridors', done: true },
      { id: 'c2', label: 'Agree on morning AQI check time (6:45 AM)', done: false },
      { id: 'c3', label: 'Set up backup carpool rotation for poor-air days', done: false },
    ],
    createdAtIso: new Date(Date.now() - 86400000 * 3).toISOString(),
    isLocalDraft: true,
  },
  {
    id: 'comm-no-idling',
    title: 'School & Market Drop-Off No-Idling Pledge',
    category: 'awareness',
    neighborhood: 'Local Sample Initiative',
    description:
      'Encourage drivers waiting near school gates and local markets to switch off engines to cut localized NO₂ and soot.',
    participantsCount: 1,
    joinedByMe: false,
    checklist: [
      { id: 'c4', label: 'Share plain-language flyer on idling health effects', done: false },
      { id: 'c5', label: 'Coordinate with resident association for reminder sign', done: false },
    ],
    createdAtIso: new Date(Date.now() - 86400000 * 6).toISOString(),
    isLocalDraft: true,
  },
];

export const SAMPLE_EXPOSURE_LOGS: ExposureLogEntry[] = [
  {
    id: 'sample-log-1',
    dateIso: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    timeOfDay: '08:30',
    locationName: 'Sample Morning Commute',
    activity: 'Commuting / Walking',
    durationMinutes: 25,
    approximateAqi: 118,
    aqiStandard: 'us_aqi',
    transportMode: 'Walking',
    usedMask: true,
    maskType: 'N95 / FFP2',
    notes: 'Sample demonstration log entry — edit or delete anytime.',
  },
];
