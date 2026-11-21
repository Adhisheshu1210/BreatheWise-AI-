import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Compass, Loader2, MapPin, RefreshCw } from 'lucide-react';
import { buildDemoGridStations } from '../data/demoData.ts';
import { fetchRegionalGridApi } from '../services/apiClient.ts';
import type {
  AirQualitySnapshot,
  AqiStandard,
  GridStationPoint,
} from '../types/airQuality.ts';
import { CategoryStatusIcon } from '../components/AqiGauge.tsx';
import { getAqiCategory } from '../utils/aqi.ts';

interface AirQualityMapViewProps {
  snapshot: AirQualitySnapshot | null;
  aqiStandard: AqiStandard;
  onOpenLocationModal: () => void;
}

export function AirQualityMapView({
  snapshot,
  aqiStandard,
  onOpenLocationModal,
}: AirQualityMapViewProps) {
  const [stations, setStations] = useState<GridStationPoint[]>([]);
  const [selectedId, setSelectedId] = useState<string>('grid-0');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gridAbortRef = useRef<AbortController | null>(null);

  const loadGrid = useCallback(async () => {
    if (!snapshot) return;
    gridAbortRef.current?.abort();

    if (snapshot.isDemo) {
      const demoStations = buildDemoGridStations(snapshot);
      setStations(demoStations);
      setSelectedId(demoStations[0]?.id ?? '');
      setError(null);
      return;
    }

    const controller = new AbortController();
    gridAbortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const list = await fetchRegionalGridApi(
        snapshot.location.latitude,
        snapshot.location.longitude,
        snapshot.location.name,
        controller.signal
      );
      if (controller.signal.aborted) return;
      setStations(list);
      setSelectedId(list[0]?.id ?? '');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(
        err instanceof Error ? err.message : 'Unable to load regional sensor grid.'
      );
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [snapshot]);

  useEffect(() => {
    void loadGrid();
    return () => {
      gridAbortRef.current?.abort();
    };
  }, [loadGrid]);

  if (!snapshot) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
        <MapPin className="w-8 h-8 text-teal-700 mx-auto mb-2" />
        <h2 className="text-lg font-semibold text-slate-900">Select a Location First</h2>
        <button
          type="button"
          onClick={onOpenLocationModal}
          className="mt-4 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg"
        >
          Choose City
        </button>
      </div>
    );
  }

  const selectedStation = stations.find((s) => s.id === selectedId) ?? stations[0];
  const orderDirs = ['NW', 'N', 'NE', 'W', 'Center', 'E', 'SW', 'S', 'SE'];
  const orderedGrid = orderDirs
    .map((dir) => stations.find((s) => s.direction === dir))
    .filter((s): s is GridStationPoint => Boolean(s));

  const cleanest = [...stations]
    .filter((s) => (aqiStandard === 'eaqi' ? s.eaqi : s.usAqi) !== null)
    .sort(
      (a, b) =>
        ((aqiStandard === 'eaqi' ? a.eaqi : a.usAqi) ?? 999) -
        ((aqiStandard === 'eaqi' ? b.eaqi : b.usAqi) ?? 999)
    )[0];

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Regional Air Quality Spatial Grid
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              {snapshot.isDemo
                ? 'DEMO DATA — Simulated 9-sector spatial readings around '
                : '9-point atmospheric sampling grid (~13 km radius) around '}
              <strong className="text-slate-800">{snapshot.location.name}</strong>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadGrid}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh Grid
            </button>
            <button
              type="button"
              onClick={onOpenLocationModal}
              className="px-3 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800"
            >
              Change City
            </button>
          </div>
        </div>

        {loading && stations.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center text-sm text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin text-teal-700 mb-2" />
            Sampling surrounding atmospheric grid...
          </div>
        ) : error ? (
          <div className="my-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-900 text-xs flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </span>
            <button
              type="button"
              onClick={loadGrid}
              className="px-3 py-1.5 font-medium bg-white border border-red-300 rounded-md"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* 3x3 Interactive Compass Map Grid */}
            <div className="lg:col-span-7">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
                  <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                    <Compass className="w-4 h-4 text-teal-700" />
                    Select a sector to inspect pollutant levels
                  </span>
                  <span className="font-mono">~26 km × 26 km span</span>
                </div>

                <div className="grid grid-cols-3 gap-2.5" role="group" aria-label="3 by 3 atmospheric compass grid">
                  {orderedGrid.map((pt) => {
                    const val = aqiStandard === 'eaqi' ? pt.eaqi : pt.usAqi;
                    const cat = getAqiCategory(val, aqiStandard);
                    const isSelected = pt.id === selectedStation?.id;

                    return (
                      <button
                        key={pt.id}
                        type="button"
                        aria-pressed={isSelected}
                        aria-label={`${pt.direction} sector, ${pt.label}, ${
                          val !== null ? `AQI ${val}, ${cat.label}` : 'reading unavailable'
                        }`}
                        onClick={() => setSelectedId(pt.id)}
                        className={`p-3 min-h-[96px] rounded-lg border text-left transition-all ${
                          isSelected
                            ? 'ring-2 ring-slate-900 border-slate-900 bg-white'
                            : `${cat.bgClass} ${cat.borderClass} hover:brightness-97`
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[11px] font-semibold text-slate-700">
                            {pt.direction}
                          </span>
                          <span className="text-[11px] font-mono text-slate-600">
                            {pt.distanceKm === 0 ? 'Center' : `${pt.distanceKm} km`}
                          </span>
                        </div>
                        <div className="mt-1 font-mono tabular-nums text-2xl font-bold text-slate-900">
                          {val ?? '—'}
                        </div>
                        <div className={`inline-flex items-center gap-1 text-[11px] font-semibold truncate ${cat.badgeTextClass}`}>
                          <CategoryStatusIcon categoryId={cat.id} className="w-3 h-3 shrink-0" />
                          <span className="truncate">{cat.shortLabel}</span>
                        </div>
                        <div className="text-[11px] text-slate-700 truncate mt-0.5">
                          {pt.label}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Selected Sector Inspector */}
            <div className="lg:col-span-5 space-y-4">
              {selectedStation && (
                <div className="p-5 rounded-xl border border-slate-200 bg-white space-y-4">
                  <div>
                    <p className="text-xs text-slate-600">
                      Sector Details · {selectedStation.direction} ({selectedStation.distanceKm} km from center)
                    </p>
                    <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                      {selectedStation.label}
                    </h2>
                    <p className="text-xs font-mono text-slate-600 mt-0.5">
                      {selectedStation.latitude.toFixed(3)}°, {selectedStation.longitude.toFixed(3)}°
                    </p>
                  </div>

                  {(() => {
                    const val =
                      aqiStandard === 'eaqi' ? selectedStation.eaqi : selectedStation.usAqi;
                    const cat = getAqiCategory(val, aqiStandard);
                    return (
                      <div className={`p-3.5 rounded-lg border ${cat.bgClass} ${cat.borderClass}`}>
                        <div className="text-xs font-medium text-slate-700">
                          {aqiStandard === 'eaqi' ? 'European EAQI' : 'US EPA AQI'}
                        </div>
                        <div className="flex items-center gap-2.5 mt-1">
                          <span className="font-mono tabular-nums text-3xl font-bold text-slate-900">
                            {val ?? '—'}
                          </span>
                          <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${cat.textClass}`}>
                            <CategoryStatusIcon categoryId={cat.id} className="w-4 h-4 shrink-0" />
                            {cat.label}
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-center">
                    <div className="p-2.5 rounded-lg bg-slate-50">
                      <div className="text-[11px] font-medium text-slate-600">PM2.5</div>
                      <div className="font-mono tabular-nums text-sm font-bold text-slate-900 mt-0.5">
                        {selectedStation.pm2_5 ?? '—'}
                      </div>
                      <div className="text-[11px] text-slate-600">µg/m³</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50">
                      <div className="text-[11px] font-medium text-slate-600">PM10</div>
                      <div className="font-mono tabular-nums text-sm font-bold text-slate-900 mt-0.5">
                        {selectedStation.pm10 ?? '—'}
                      </div>
                      <div className="text-[11px] text-slate-600">µg/m³</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50">
                      <div className="text-[11px] font-medium text-slate-600">NO₂</div>
                      <div className="font-mono tabular-nums text-sm font-bold text-slate-900 mt-0.5">
                        {selectedStation.no2 ?? '—'}
                      </div>
                      <div className="text-[11px] text-slate-600">µg/m³</div>
                    </div>
                  </div>
                </div>
              )}

              {cleanest && (
                <div className="p-4 rounded-xl border border-teal-200 bg-teal-50 text-teal-950 text-xs">
                  <div className="font-semibold">Lowest-Reading Sector Nearby</div>
                  <p className="mt-1">
                    <strong>{cleanest.label}</strong> ({cleanest.direction}) currently shows the
                    lowest reading in this grid at{' '}
                    <span className="font-mono font-semibold">
                      {aqiStandard === 'eaqi' ? cleanest.eaqi : cleanest.usAqi}
                    </span>{' '}
                    ({aqiStandard === 'eaqi' ? 'EAQI' : 'US AQI'}). Note that hyperlocal street
                    traffic can still vary block by block.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
