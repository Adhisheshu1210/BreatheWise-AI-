import type {
  AirQualitySnapshot,
  GridStationPoint,
  LocationResult,
  TrendPoint,
} from '../src/types/airQuality.ts';
import {
  buildPollutantReadings,
  calculateUsAqiFromPm25,
  computeFreshness,
  determinePrimaryPollutant,
  generateAlertsFromData,
} from '../src/utils/aqi.ts';

export class ProviderError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 502) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.status = status;
  }
}

export interface AirQualityProvider {
  readonly id: string;
  readonly displayName: string;
  searchLocations(query: string): Promise<LocationResult[]>;
  fetchAirQuality(location: LocationResult): Promise<AirQualitySnapshot>;
  fetchRegionalGrid(lat: number, lon: number, centerLabel: string): Promise<GridStationPoint[]>;
}

const SEARCH_TTL_MS = 15 * 60 * 1000;
const AQI_TTL_MS = 10 * 60 * 1000;

class BoundedTtlCache<T> {
  private readonly store = new Map<string, { value: T; expiresAt: number }>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(ttlMs: number, maxEntries = 100) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
  }

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }
  clear(): void {
    this.store.clear();
  }
}

const searchCache = new BoundedTtlCache<LocationResult[]>(SEARCH_TTL_MS, 100);
const aqiCache = new BoundedTtlCache<AirQualitySnapshot>(AQI_TTL_MS, 120);
const gridCache = new BoundedTtlCache<GridStationPoint[]>(AQI_TTL_MS, 100);

export function clearProviderCaches(): void {
  searchCache.clear();
  aqiCache.clear();
  gridCache.clear();
}

function asFiniteNumber(val: unknown): number | null {
  return typeof val === 'number' && Number.isFinite(val) ? val : null;
}

function asNonNegNumber(val: unknown): number | null {
  return typeof val === 'number' && Number.isFinite(val) && val >= 0 ? val : null;
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (res.status === 429) {
      throw new ProviderError(
        'RATE_LIMITED',
        'Environmental data provider rate limit reached. Please retry shortly.',
        429
      );
    }
    if (!res.ok) {
      throw new ProviderError(
        'UPSTREAM_HTTP_ERROR',
        `Environmental data provider responded with status ${res.status}.`,
        502
      );
    }
    const rawText = await res.text();
    try {
      return JSON.parse(rawText) as T;
    } catch {
      throw new ProviderError(
        'INVALID_RESPONSE',
        'Environmental data provider returned malformed data.',
        502
      );
    }
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ProviderError(
        'TIMEOUT',
        'Environmental data request timed out. You can retry or switch to Demo Mode.',
        504
      );
    }
    throw new ProviderError(
      'NETWORK_ERROR',
      'Unable to reach environmental data provider. Check connectivity or use Demo Mode.',
      502
    );
  } finally {
    clearTimeout(timer);
  }
}

interface OpenMeteoGeocodingResponse {
  results?: Array<{
    id: number;
    name: string;
    latitude: number;
    longitude: number;
    country?: string;
    country_code?: string;
    admin1?: string;
    timezone?: string;
    population?: number;
  }>;
}

interface OpenMeteoAirResponse {
  error?: unknown;
  latitude: number;
  longitude: number;
  timezone?: string;
  current?: {
    time: string;
    pm10?: number | null;
    pm2_5?: number | null;
    nitrogen_dioxide?: number | null;
    ozone?: number | null;
    sulphur_dioxide?: number | null;
    carbon_monoxide?: number | null;
    us_aqi?: number | null;
    european_aqi?: number | null;
  };
  hourly?: {
    time: string[];
    pm10?: Array<number | null>;
    pm2_5?: Array<number | null>;
    nitrogen_dioxide?: Array<number | null>;
    ozone?: Array<number | null>;
    us_aqi?: Array<number | null>;
    european_aqi?: Array<number | null>;
  };
}

interface OpenMeteoWeatherResponse {
  current?: {
    time: string;
    temperature_2m?: number | null;
    relative_humidity_2m?: number | null;
    wind_speed_10m?: number | null;
    surface_pressure?: number | null;
  };
}

function buildIllustrative30dSample(baseAqi: number, basePm25: number, basePm10: number): TrendPoint[] {
  const now = new Date();
  const points: TrendPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const dt = new Date(now.getTime() - i * 86400 * 1000);
    const wave = 0.85 + ((Math.sin(i * 0.7) + 1) / 2) * 0.3;
    points.push({
      timestamp: dt.toISOString(),
      label: dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      usAqi: Math.max(10, Math.round(baseAqi * wave)),
      eaqi: Math.max(8, Math.round((baseAqi / 2.6) * wave)),
      pm2_5: Math.round(basePm25 * wave * 10) / 10,
      pm10: Math.round(basePm10 * wave * 10) / 10,
      no2: null,
      o3: null,
    });
  }
  return points;
}

export function normalizeOpenMeteoTimestamp(rawTime: unknown): number | null {
  if (typeof rawTime !== 'string' || !rawTime.trim()) return null;
  const trimmed = rawTime.trim();
  const normalized = trimmed.endsWith('Z')
    ? trimmed
    : trimmed.length === 16
    ? `${trimmed}:00Z`
    : `${trimmed}Z`;
  const ts = Date.parse(normalized);
  return Number.isNaN(ts) ? null : ts;
}

export function parseOpenMeteoTrends(
  hourly: OpenMeteoAirResponse['hourly'],
  nowMs: number = Date.now()
): { hourly24h: TrendPoint[]; daily7d: TrendPoint[] } {
  const hourlyTimes = Array.isArray(hourly?.time) ? hourly.time : [];
  const allHourly: TrendPoint[] = [];

  for (let i = 0; i < hourlyTimes.length; i++) {
    const ts = normalizeOpenMeteoTimestamp(hourlyTimes[i]);
    if (ts === null || ts > nowMs + 30 * 60 * 1000) continue;
    const dt = new Date(ts);
    allHourly.push({
      timestamp: dt.toISOString(),
      label: dt.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }),
      usAqi: asNonNegNumber(hourly?.us_aqi?.[i]),
      eaqi: asNonNegNumber(hourly?.european_aqi?.[i]),
      pm2_5: asNonNegNumber(hourly?.pm2_5?.[i]),
      pm10: asNonNegNumber(hourly?.pm10?.[i]),
      no2: asNonNegNumber(hourly?.nitrogen_dioxide?.[i]),
      o3: asNonNegNumber(hourly?.ozone?.[i]),
    });
  }

  const hourly24h = allHourly.slice(-24);
  const dayMap = new Map<string, TrendPoint[]>();
  for (const pt of allHourly) {
    const dayKey = pt.timestamp.slice(0, 10);
    const list = dayMap.get(dayKey) ?? [];
    list.push(pt);
    dayMap.set(dayKey, list);
  }

  const avgOrNull = (vals: Array<number | null>): number | null => {
    const valid = vals.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (valid.length === 0) return null;
    return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10;
  };

  const daily7d: TrendPoint[] = Array.from(dayMap.entries())
    .slice(-7)
    .map(([dayKey, pts]) => {
      const dt = new Date(`${dayKey}T12:00:00Z`);
      const avgUs = avgOrNull(pts.map((p) => p.usAqi));
      const avgEa = avgOrNull(pts.map((p) => p.eaqi));
      return {
        timestamp: dt.toISOString(),
        label: dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        usAqi: avgUs !== null ? Math.round(avgUs) : null,
        eaqi: avgEa !== null ? Math.round(avgEa) : null,
        pm2_5: avgOrNull(pts.map((p) => p.pm2_5)),
        pm10: avgOrNull(pts.map((p) => p.pm10)),
        no2: avgOrNull(pts.map((p) => p.no2)),
        o3: avgOrNull(pts.map((p) => p.o3)),
      };
    });

  return { hourly24h, daily7d };
}

function parseWeatherResult(
  weatherResult: PromiseSettledResult<OpenMeteoWeatherResponse>
): AirQualitySnapshot['weather'] {
  if (weatherResult.status !== 'fulfilled' || !weatherResult.value?.current) {
    return {
      temperatureC: null,
      humidityPercent: null,
      windSpeedKmh: null,
      surfacePressureHpa: null,
      observedAt: null,
    };
  }
  const c = weatherResult.value.current;
  return {
    temperatureC: asFiniteNumber(c.temperature_2m),
    humidityPercent: asNonNegNumber(c.relative_humidity_2m),
    windSpeedKmh: asNonNegNumber(c.wind_speed_10m),
    surfacePressureHpa: asNonNegNumber(c.surface_pressure),
    observedAt: typeof c.time === 'string' ? c.time : null,
  };
}

interface GridOffsetSpec {
  dir: string;
  label: string;
  dLat: number;
  dLon: number;
  km: number;
}

function parseGridStationPoint(
  item: OpenMeteoAirResponse | undefined,
  offset: GridOffsetSpec,
  lat: number,
  lon: number,
  idx: number
): GridStationPoint {
  const c = item?.current;
  const rawPm25 = asNonNegNumber(c?.pm2_5);
  const rawPm10 = asNonNegNumber(c?.pm10);
  const rawNo2 = asNonNegNumber(c?.nitrogen_dioxide);
  const rawUsAqi = asNonNegNumber(c?.us_aqi);
  const rawEaqi = asNonNegNumber(c?.european_aqi);

  const pm25 = rawPm25 !== null ? Math.round(rawPm25 * 10) / 10 : null;
  const pm10 = rawPm10 !== null ? Math.round(rawPm10 * 10) / 10 : null;
  const no2 = rawNo2 !== null ? Math.round(rawNo2 * 10) / 10 : null;
  const usAqi =
    rawUsAqi !== null
      ? Math.round(rawUsAqi)
      : pm25 !== null
      ? calculateUsAqiFromPm25(pm25)
      : null;
  const eaqi = rawEaqi !== null ? Math.round(rawEaqi) : null;

  const readings = buildPollutantReadings({ pm2_5: pm25, pm10, no2 });
  return {
    id: `grid-${idx}`,
    label: offset.label,
    direction: offset.dir,
    distanceKm: offset.km,
    latitude: Math.round((lat + offset.dLat) * 1000) / 1000,
    longitude: Math.round((lon + offset.dLon) * 1000) / 1000,
    usAqi,
    eaqi,
    pm2_5: pm25,
    pm10,
    no2,
    dominantPollutant: determinePrimaryPollutant(readings),
  };
}

export class OpenMeteoProvider implements AirQualityProvider {
  readonly id = 'open-meteo';
  readonly displayName = 'Open-Meteo Air Quality (Copernicus CAMS)';

  async searchLocations(query: string): Promise<LocationResult[]> {
    const normalized = query.trim().toLowerCase();
    if (normalized.length < 2) return [];

    const cached = searchCache.get(normalized);
    if (cached) {
      return cached;
    }

    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      query.trim()
    )}&count=8&language=en&format=json`;

    const data = await fetchJsonWithTimeout<OpenMeteoGeocodingResponse>(url, 7000);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new ProviderError(
        'INVALID_RESPONSE',
        'Location geocoding provider returned malformed data.',
        502
      );
    }
    const rawList = Array.isArray(data.results) ? data.results : [];
    const results: LocationResult[] = rawList
      .filter(
        (item) =>
          Boolean(item) &&
          typeof item.name === 'string' &&
          item.name.trim().length > 0 &&
          typeof item.latitude === 'number' &&
          Number.isFinite(item.latitude) &&
          item.latitude >= -90 &&
          item.latitude <= 90 &&
          typeof item.longitude === 'number' &&
          Number.isFinite(item.longitude) &&
          item.longitude >= -180 &&
          item.longitude <= 180
      )
      .map((item, idx) => ({
        id: `om-${item.id ?? idx}`,
        name: item.name.trim(),
        admin1: item.admin1,
        country: item.country ?? 'Unknown',
        countryCode: item.country_code,
        latitude: item.latitude,
        longitude: item.longitude,
        timezone: item.timezone,
        population: item.population,
      }));

    searchCache.set(normalized, results);
    return results;
  }

  async fetchAirQuality(location: LocationResult): Promise<AirQualitySnapshot> {
    const cacheKey = `${location.latitude.toFixed(2)},${location.longitude.toFixed(2)}`;
    const cached = aqiCache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        location,
      };
    }

    const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${location.latitude}&longitude=${location.longitude}&current=pm10,pm2_5,nitrogen_dioxide,ozone,sulphur_dioxide,carbon_monoxide,us_aqi,european_aqi&hourly=pm10,pm2_5,nitrogen_dioxide,ozone,us_aqi,european_aqi&past_days=6&forecast_days=1&timezone=GMT`;
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,surface_pressure&timezone=GMT`;

    const [aqData, weatherResult] = await Promise.allSettled([
      fetchJsonWithTimeout<OpenMeteoAirResponse>(aqUrl, 8500),
      fetchJsonWithTimeout<OpenMeteoWeatherResponse>(weatherUrl, 6000),
    ]);

    if (aqData.status === 'rejected') {
      throw aqData.reason;
    }

    const aq = aqData.value;
    if (
      !aq ||
      typeof aq !== 'object' ||
      aq.error ||
      (!aq.current && (!Array.isArray(aq.hourly?.time) || aq.hourly.time.length === 0))
    ) {
      throw new ProviderError(
        'INVALID_RESPONSE',
        'Environmental data provider returned incomplete air quality data.',
        502
      );
    }

    const current = aq.current ?? { time: '' };
    const weather = parseWeatherResult(weatherResult);

    const pollutants = buildPollutantReadings({
      pm2_5: current.pm2_5,
      pm10: current.pm10,
      no2: current.nitrogen_dioxide,
      o3: current.ozone,
      so2: current.sulphur_dioxide,
      co: current.carbon_monoxide,
    });

    const rawUsAqi = asNonNegNumber(current.us_aqi);
    const rawPm25 = asNonNegNumber(current.pm2_5);
    const usAqi =
      rawUsAqi !== null
        ? Math.round(rawUsAqi)
        : rawPm25 !== null
        ? calculateUsAqiFromPm25(rawPm25)
        : null;

    const rawEaqi = asNonNegNumber(current.european_aqi);
    const eaqi = rawEaqi !== null ? Math.round(rawEaqi) : null;

    const { hourly24h, daily7d } = parseOpenMeteoTrends(aq.hourly, Date.now());

    const parsedCurrentTs = normalizeOpenMeteoTimestamp(current.time);
    const lastUpdatedIso =
      parsedCurrentTs !== null
        ? new Date(parsedCurrentTs).toISOString()
        : new Date().toISOString();
    const freshness: { status: AirQualitySnapshot['freshnessStatus']; label: string } =
      parsedCurrentTs !== null
        ? computeFreshness(lastUpdatedIso, false)
        : { status: 'aging', label: 'Timestamp unavailable' };

    const basePm25 = rawPm25 ?? 22;
    const basePm10 = asNonNegNumber(current.pm10) ?? 38;

    const snapshot: AirQualitySnapshot = {
      location,
      isDemo: false,
      dataSource: this.displayName,
      attribution: 'Open-Meteo Air Quality API (Copernicus Atmosphere Monitoring Service, CC-BY 4.0)',
      currentUsAqi: usAqi,
      currentEaqi: eaqi,
      primaryPollutant: determinePrimaryPollutant(pollutants),
      lastUpdatedIso,
      fetchedAtIso: new Date().toISOString(),
      freshnessStatus: freshness.status,
      freshnessLabel: freshness.label,
      pollutants,
      weather,
      hourly24h,
      daily7d,
      historical30dAvailable: false,
      historical30dNote:
        'Live upstream feed provides up to 7 days of historical hourly observations. Switch to 24h or 7d for live measurements; 30d shows an illustrative baseline only.',
      sample30dTrend: buildIllustrative30dSample(usAqi ?? 65, basePm25, basePm10),
      alerts: generateAlertsFromData({
        usAqi,
        hourly24h,
        windSpeedKmh: weather.windSpeedKmh,
        isDemo: false,
      }),
    };

    aqiCache.set(cacheKey, snapshot);

    return snapshot;
  }

  async fetchRegionalGrid(
    lat: number,
    lon: number,
    centerLabel: string
  ): Promise<GridStationPoint[]> {
    const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    const cached = gridCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const offsets: GridOffsetSpec[] = [
      { dir: 'Center', label: `${centerLabel} Central`, dLat: 0, dLon: 0, km: 0 },
      { dir: 'N', label: 'North Sector', dLat: 0.12, dLon: 0, km: 13 },
      { dir: 'NE', label: 'Northeast Corridor', dLat: 0.09, dLon: 0.1, km: 13 },
      { dir: 'E', label: 'East District', dLat: 0, dLon: 0.14, km: 14 },
      { dir: 'SE', label: 'Southeast Belt', dLat: -0.09, dLon: 0.1, km: 13 },
      { dir: 'S', label: 'South Sector', dLat: -0.12, dLon: 0, km: 13 },
      { dir: 'SW', label: 'Southwest Belt', dLat: -0.09, dLon: -0.1, km: 13 },
      { dir: 'W', label: 'West District', dLat: 0, dLon: -0.14, km: 14 },
      { dir: 'NW', label: 'Northwest Corridor', dLat: 0.09, dLon: -0.1, km: 13 },
    ];

    const lats = offsets
      .map((o) => Math.max(-89, Math.min(89, lat + o.dLat)).toFixed(4))
      .join(',');
    const lons = offsets
      .map((o) => {
        let v = lon + o.dLon;
        if (v > 180) v -= 360;
        if (v < -180) v += 360;
        return v.toFixed(4);
      })
      .join(',');

    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats}&longitude=${lons}&current=pm10,pm2_5,nitrogen_dioxide,us_aqi,european_aqi`;
    const raw = await fetchJsonWithTimeout<OpenMeteoAirResponse[] | OpenMeteoAirResponse>(
      url,
      8500
    );
    const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
    if (list.length === 0) {
      throw new ProviderError(
        'INVALID_RESPONSE',
        'Regional air quality grid returned no station data.',
        502
      );
    }

    const points: GridStationPoint[] = offsets.map((offset, idx) =>
      parseGridStationPoint(list[idx] ?? list[0], offset, lat, lon, idx)
    );

    if (points.every((pt) => pt.usAqi === null && pt.pm2_5 === null && pt.pm10 === null)) {
      throw new ProviderError(
        'INVALID_RESPONSE',
        'Regional air quality grid returned incomplete measurements.',
        502
      );
    }

    gridCache.set(cacheKey, points);
    return points;
  }
}

export const activeAirQualityProvider: AirQualityProvider = new OpenMeteoProvider();
