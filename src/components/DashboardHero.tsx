import {
  CalendarClock,
  Droplets,
  Home,
  MapPin,
  MessageSquare,
  Thermometer,
  Wind,
} from 'lucide-react';
import { AqiGauge, CategoryStatusIcon } from './AqiGauge.tsx';
import type {
  AirQualitySnapshot,
  AqiCategoryMeta,
  NavSection,
  PollutantReading,
  UserPreferences,
} from '../types/airQuality.ts';
import { POLLUTANT_META, formatTemperature } from '../utils/aqi.ts';

interface DashboardHeroProps {
  snapshot: AirQualitySnapshot;
  activeAqi: number | null;
  category: AqiCategoryMeta;
  prefs: UserPreferences;
  primaryReading: PollutantReading | null;
  onNavigate: (section: NavSection) => void;
}

export function DashboardHero({
  snapshot,
  activeAqi,
  category,
  prefs,
  primaryReading,
  onNavigate,
}: DashboardHeroProps) {
  const primaryMeta = snapshot.primaryPollutant
    ? POLLUTANT_META[snapshot.primaryPollutant]
    : null;

  const updatedTimeStr = (() => {
    const dt = new Date(snapshot.lastUpdatedIso || snapshot.fetchedAtIso);
    return Number.isNaN(dt.getTime())
      ? snapshot.freshnessLabel
      : `${snapshot.freshnessLabel} · ${dt.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}`;
  })();

  const maskVerdict =
    (snapshot.currentUsAqi ?? 0) > 150
      ? 'Wear snug N95 / FFP2 respirator outdoors'
      : (snapshot.currentUsAqi ?? 0) > 100
      ? 'N95 helpful for prolonged roadside stays or sensitive groups'
      : 'Mask not generally needed for ambient air';

  return (
    <section
      className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6"
      aria-labelledby="dashboard-hero-heading"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Left: (1) How is the air? */}
        <div className="lg:col-span-5 flex flex-col items-center border-b lg:border-b-0 lg:border-r border-slate-200 pb-6 lg:pb-0 lg:pr-6">
          <div className="w-full flex items-center justify-between gap-2 text-xs text-slate-600 mb-2">
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
              <MapPin className="w-3.5 h-3.5 text-teal-700 shrink-0" aria-hidden="true" />
              {snapshot.location.name}
              {snapshot.location.country ? `, ${snapshot.location.country}` : ''}
            </span>
            <span className="font-mono text-[11px] text-slate-600 text-right">
              {updatedTimeStr}
            </span>
          </div>

          <AqiGauge
            value={activeAqi}
            standard={prefs.aqiStandard}
            category={category}
            primaryPollutantLabel={
              primaryMeta && primaryReading && primaryReading.value !== null
                ? `${primaryMeta.label} (${primaryReading.value} ${primaryMeta.unit})`
                : primaryMeta?.label ?? null
            }
          />

          <div className="mt-4 w-full grid grid-cols-3 gap-2 pt-4 border-t border-slate-100 text-center">
            <div>
              <div className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600">
                <Thermometer className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
                Temp
              </div>
              <div className="font-mono tabular-nums text-sm font-semibold text-slate-900 mt-0.5">
                {formatTemperature(snapshot.weather.temperatureC, prefs.tempUnit)}
              </div>
            </div>
            <div>
              <div className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600">
                <Droplets className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
                Humidity
              </div>
              <div className="font-mono tabular-nums text-sm font-semibold text-slate-900 mt-0.5">
                {snapshot.weather.humidityPercent !== null
                  ? `${snapshot.weather.humidityPercent}%`
                  : '—'}
              </div>
            </div>
            <div>
              <div className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600">
                <Wind className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
                Wind
              </div>
              <div className="font-mono tabular-nums text-sm font-semibold text-slate-900 mt-0.5">
                {snapshot.weather.windSpeedKmh !== null
                  ? `${Math.round(snapshot.weather.windSpeedKmh)} km/h`
                  : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Right: (2) What is the risk? + (3) What should I do today? */}
        <div className="lg:col-span-7 space-y-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-semibold ${category.bgClass} ${category.borderClass} ${category.textClass}`}
              >
                <CategoryStatusIcon categoryId={category.id} className="w-3.5 h-3.5" />
                Risk Level: {category.shortLabel}
              </span>
              <span className="text-xs text-slate-600">
                {snapshot.weather.windSpeedKmh !== null && snapshot.weather.windSpeedKmh < 8
                  ? 'Calm air · slow dispersion'
                  : 'Breezy air · active dispersion'}
              </span>
            </div>

            <h1
              id="dashboard-hero-heading"
              className="text-2xl font-bold tracking-tight text-slate-900 leading-snug"
            >
              {category.summary}
            </h1>
            <p className="text-sm text-slate-700 leading-relaxed">
              {primaryMeta && primaryReading && primaryReading.value !== null
                ? `Primary driver is ${primaryMeta.fullName} (${primaryMeta.label}) at ${primaryReading.value} ${primaryMeta.unit}. ${primaryMeta.actionTip}`
                : category.outdoorGuidance}
            </p>
          </div>

          <div
            className="grid grid-cols-1 sm:grid-cols-3 gap-3"
            aria-label="What you should do today"
          >
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Outdoor Activity
              </div>
              <p className="text-xs font-medium text-slate-900 mt-1 leading-relaxed">
                {category.outdoorGuidance}
              </p>
            </div>
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Windows & Home
              </div>
              <p className="text-xs font-medium text-slate-900 mt-1 leading-relaxed">
                {category.ventilationGuidance}
              </p>
            </div>
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Personal Protection
              </div>
              <p className="text-xs font-medium text-slate-900 mt-1 leading-relaxed">
                {maskVerdict}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => onNavigate('planner')}
              className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[40px] text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg whitespace-nowrap"
            >
              <CalendarClock className="w-4 h-4 text-teal-300" aria-hidden="true" />
              Open Daily Plan
            </button>
            <button
              type="button"
              onClick={() => onNavigate('indoor')}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 min-h-[40px] text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap"
            >
              <Home className="w-4 h-4 text-teal-700" aria-hidden="true" />
              Home Air Care
            </button>
            <button
              type="button"
              onClick={() => onNavigate('assistant')}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 min-h-[40px] text-xs font-medium text-teal-900 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-lg whitespace-nowrap"
            >
              <MessageSquare className="w-4 h-4 text-teal-700" aria-hidden="true" />
              Ask AI Assistant
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
