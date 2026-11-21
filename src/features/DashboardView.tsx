import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Droplets,
  Home,
  Info,
  MapPin,
  MessageSquare,
  RefreshCw,
  ShieldAlert,
  Thermometer,
  Wind,
} from 'lucide-react';
import { AqiGauge, CategoryStatusIcon } from '../components/AqiGauge.tsx';
import { TrendChart } from '../components/TrendChart.tsx';
import { ChecklistToggleRow } from '../components/UiFeedback.tsx';
import { useLocalStorage } from '../hooks/useLocalStorage.ts';
import type {
  AirQualitySnapshot,
  DailyPlanItem,
  NavSection,
  UserPreferences,
} from '../types/airQuality.ts';
import {
  POLLUTANT_META,
  formatTemperature,
  getActiveAqiValue,
  getAqiCategory,
} from '../utils/aqi.ts';

interface DashboardViewProps {
  snapshot: AirQualitySnapshot | null;
  loading: boolean;
  error: string | null;
  prefs: UserPreferences;
  dailyPlan: DailyPlanItem[];
  onRetry: () => void;
  onOpenLocationModal: () => void;
  onNavigate: (section: NavSection) => void;
  onSwitchToDemo: () => void;
}

function getAlertToneMeta(severity: 'info' | 'warning' | 'elevated' | 'severe') {
  if (severity === 'severe') {
    return {
      containerClass: 'bg-red-50 border-red-200 text-red-950',
      labelClass: 'text-red-800',
      label: 'Severe Alert',
      Icon: ShieldAlert,
    };
  }
  if (severity === 'elevated' || severity === 'warning') {
    return {
      containerClass: 'bg-amber-50 border-amber-200 text-amber-950',
      labelClass: 'text-amber-800',
      label: severity === 'elevated' ? 'Elevated Advisory' : 'Advisory',
      Icon: AlertTriangle,
    };
  }
  return {
    containerClass: 'bg-teal-50 border-teal-200 text-teal-950',
    labelClass: 'text-teal-800',
    label: 'Air Update',
    Icon: Info,
  };
}

function getPollutantThresholdMeta(ratio: number | null) {
  if (ratio === null) {
    return {
      barClass: 'bg-slate-300',
      textClass: 'text-slate-600',
      statusText: 'Unavailable',
    };
  }
  if (ratio >= 3) {
    return {
      barClass: 'bg-red-600',
      textClass: 'text-red-800',
      statusText: `High (${ratio.toFixed(1)}× WHO)`,
    };
  }
  if (ratio > 1) {
    return {
      barClass: 'bg-amber-600',
      textClass: 'text-amber-800',
      statusText: `Elevated (${ratio.toFixed(1)}× WHO)`,
    };
  }
  return {
    barClass: 'bg-teal-600',
    textClass: 'text-teal-800',
    statusText: 'Within WHO guide',
  };
}

export function DashboardView({
  snapshot,
  loading,
  error,
  prefs,
  dailyPlan,
  onRetry,
  onOpenLocationModal,
  onNavigate,
  onSwitchToDemo,
}: DashboardViewProps) {
  const [smogChecks, setSmogChecks] = useLocalStorage<Record<string, boolean>>(
    'bw_severe_smog_checks_v1',
    {}
  );

  if (loading && !snapshot) {
    return (
      <div className="space-y-6" role="status" aria-live="polite" aria-label="Loading air quality data">
        <span className="sr-only">Loading current air quality readings and guidance...</span>
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-7">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-5 flex flex-col items-center gap-3 py-4">
              <div className="w-52 h-28 rounded-t-full bg-slate-100" />
              <div className="h-6 w-36 rounded-md bg-slate-100" />
              <div className="h-4 w-44 rounded bg-slate-100" />
            </div>
            <div className="lg:col-span-7 space-y-4">
              <div className="h-7 w-2/3 rounded bg-slate-100" />
              <div className="h-4 w-full rounded bg-slate-100" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-24 rounded-lg bg-slate-100" />
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 h-44" />
          <div className="bg-white border border-slate-200 rounded-xl p-6 h-44" />
        </div>
      </div>
    );
  }

  if (error && !snapshot) {
    return (
      <div
        role="alert"
        className="bg-white border border-red-200 rounded-xl p-8 text-center max-w-xl mx-auto my-8"
      >
        <AlertCircle className="w-10 h-10 text-red-700 mx-auto mb-3" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-slate-900">
          Unable to Load Live Environmental Data
        </h2>
        <p className="text-sm text-slate-600 mt-1.5">{error}</p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 min-h-[42px] text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Retry Live Fetch
          </button>
          <button
            type="button"
            onClick={onOpenLocationModal}
            className="px-4 py-2.5 min-h-[42px] text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
          >
            Select Another City
          </button>
          <button
            type="button"
            onClick={onSwitchToDemo}
            className="px-4 py-2.5 min-h-[42px] text-sm font-medium text-teal-900 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-lg"
          >
            Open Demo Mode
          </button>
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center max-w-xl mx-auto my-8">
        <MapPin className="w-10 h-10 text-teal-700 mx-auto mb-3" aria-hidden="true" />
        <h2 className="text-xl font-semibold text-slate-900">Select a Location to Begin</h2>
        <p className="text-sm text-slate-600 mt-1.5">
          Search for any city worldwide for live Open-Meteo readings, or preview a labeled Demo Mode
          scenario right away.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={onOpenLocationModal}
            className="px-5 py-2.5 min-h-[44px] text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
          >
            Search City or Choose Demo
          </button>
        </div>
      </div>
    );
  }

  const activeAqi = getActiveAqiValue(snapshot, prefs.aqiStandard);
  const category = getAqiCategory(activeAqi, prefs.aqiStandard);
  const primaryReading = snapshot.primaryPollutant
    ? snapshot.pollutants.find((p) => p.code === snapshot.primaryPollutant) ?? null
    : null;
  const primaryMeta = snapshot.primaryPollutant
    ? POLLUTANT_META[snapshot.primaryPollutant]
    : null;
  const isSevereSmog = (snapshot.currentUsAqi ?? 0) >= 200;

  const updatedTimeStr = (() => {
    const dt = new Date(snapshot.lastUpdatedIso || snapshot.fetchedAtIso);
    return Number.isNaN(dt.getTime())
      ? snapshot.freshnessLabel
      : `${snapshot.freshnessLabel} · ${dt.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}`;
  })();

  const severeChecklist = [
    'Close exterior windows & door gaps during peak haze',
    'Shift outdoor exercise completely indoors today',
    'Run HEPA air filtration in occupied bedrooms if available',
    'Wear a well-fitted N95/FFP2 respirator for unavoidable errands',
    'Keep prescribed respiratory rescue medication accessible',
  ];

  const maskVerdict =
    (snapshot.currentUsAqi ?? 0) > 150
      ? 'Wear snug N95 / FFP2 respirator outdoors'
      : (snapshot.currentUsAqi ?? 0) > 100
      ? 'N95 helpful for prolonged roadside stays or sensitive groups'
      : 'Mask not generally needed for ambient air';

  const priorityActionsToday = dailyPlan.slice(0, 3);

  return (
    <div className="space-y-6">
      {/* Data Source & Demo Banner */}
      {snapshot.isDemo ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-xs">
          <div className="flex items-start sm:items-center gap-2.5">
            <Info className="w-4 h-4 text-amber-800 shrink-0 mt-0.5 sm:mt-0" aria-hidden="true" />
            <span>
              <strong>DEMO DATA:</strong> Viewing simulated{' '}
              <span className="font-medium">{snapshot.location.name}</span> preset. Switch to Live
              City anytime for real Open-Meteo readings.
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenLocationModal}
            className="text-xs font-semibold text-amber-950 underline underline-offset-4 whitespace-nowrap self-start sm:self-auto py-1"
          >
            Switch to Live City
          </button>
        </div>
      ) : (
        error && (
          <div
            role="status"
            className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-xs"
          >
            <span>Refresh notice: {error} Showing last available snapshot.</span>
            <button
              type="button"
              onClick={onRetry}
              className="font-semibold underline whitespace-nowrap"
            >
              Retry
            </button>
          </div>
        )
      )}

      {/* Hero Section: Answers (1) How is the air? (2) What is the risk? (3) What should I do today? */}
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

            {/* Environmental weather context strip */}
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
            {/* Risk Headline */}
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

            {/* 3-Card Immediate Action Verdict Strip */}
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

            {/* Clear Action Links */}
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

      {/* Severe Smog Emergency Protection Mode (surfaces automatically when AQI >= 200) */}
      {isSevereSmog && (
        <section
          className="bg-red-50 border border-red-200 rounded-xl p-5 sm:p-6"
          aria-labelledby="severe-smog-heading"
          role="region"
        >
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 text-red-900 font-bold text-sm">
                <ShieldAlert className="w-5 h-5 text-red-700" aria-hidden="true" />
                <h2 id="severe-smog-heading">
                  Severe Smog Protection Mode Active (US AQI {snapshot.currentUsAqi})
                </h2>
              </div>
              <p className="text-xs text-red-900 max-w-2xl leading-relaxed">
                Air pollution is at hazardous levels. Keep sensitive groups indoors, seal leaky
                window drafts, and verify your bedroom clean-air setup. Note: BreatheWise provides
                environmental protection steps and is not a medical service.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('family')}
              className="px-3.5 py-2.5 min-h-[40px] text-xs font-semibold text-white bg-red-700 hover:bg-red-800 rounded-lg whitespace-nowrap self-start"
            >
              Open Family Shield
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {severeChecklist.map((step, idx) => {
              const key = `severe-${idx}`;
              const done = Boolean(smogChecks[key]);
              return (
                <div key={key} className="p-2.5 rounded-lg bg-white border border-red-200">
                  <ChecklistToggleRow
                    checked={done}
                    label={step}
                    onToggle={() => setSmogChecks((p) => ({ ...p, [key]: !done }))}
                  />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Alerts & Today's Priority Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section
          className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 flex flex-col justify-between"
          aria-labelledby="alerts-heading"
        >
          <div>
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <h2 id="alerts-heading" className="text-base font-semibold text-slate-900">
                Environmental Alerts
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('notifications')}
                className="text-xs font-semibold text-teal-800 hover:underline py-1"
              >
                Manage Alerts
              </button>
            </div>

            {snapshot.alerts.length === 0 ? (
              <div className="py-6 flex items-start gap-2.5 text-xs text-slate-700">
                <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  No elevated alerts currently triggered for {snapshot.location.name}. Standard
                  precautions apply.
                </span>
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
                {snapshot.alerts.map((alert) => {
                  const tone = getAlertToneMeta(alert.severity);
                  const AlertIcon = tone.Icon;
                  return (
                    <li
                      key={alert.id}
                      className={`p-3.5 rounded-lg border text-xs ${tone.containerClass}`}
                    >
                      <div className="flex items-center gap-1.5 font-semibold">
                        <AlertIcon className={`w-4 h-4 shrink-0 ${tone.labelClass}`} aria-hidden="true" />
                        <span className={`text-[11px] uppercase tracking-wide ${tone.labelClass}`}>
                          {tone.label}:
                        </span>
                        <span>{alert.title}</span>
                      </div>
                      <p className="mt-1 leading-relaxed">{alert.message}</p>
                      <p className="mt-1 font-medium leading-relaxed">{alert.recommendedAction}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section
          className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 sm:p-6"
          aria-labelledby="today-actions-heading"
        >
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <h2 id="today-actions-heading" className="text-base font-semibold text-slate-900">
                Priority Schedule Actions
              </h2>
              <p className="text-xs text-slate-600">
                Key time blocks adapted to {snapshot.location.name} and your daily routine
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('planner')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-teal-800 hover:underline whitespace-nowrap py-1"
            >
              Full Schedule
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          <ul className="mt-4 divide-y divide-slate-100">
            {priorityActionsToday.map((item) => (
              <li key={item.id} className="py-3 first:pt-0 last:pb-0 flex items-start gap-3">
                <span className="font-mono tabular-nums text-xs font-semibold text-teal-900 bg-teal-50 border border-teal-200 px-2 py-1 rounded-md shrink-0">
                  {item.time}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                  <p className="text-xs text-slate-700 mt-0.5 leading-relaxed">{item.action}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Pollutant Breakdown Matrix (Single-elevation grid with WHO benchmark meters & explicit text status) */}
      <section
        className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6"
        aria-labelledby="pollutants-heading"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-slate-100">
          <div>
            <h2 id="pollutants-heading" className="text-base font-semibold text-slate-900">
              Pollutant Breakdown & WHO Benchmarks
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Measured concentrations vs. WHO air quality guideline benchmarks
            </p>
          </div>
          <span className="text-xs text-slate-600 font-medium">{snapshot.attribution}</span>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 border border-slate-200 rounded-xl overflow-hidden bg-slate-50/30">
          {snapshot.pollutants.map((p, idx) => {
            const ratio = p.benchmarkRatio;
            const barPct = ratio !== null ? Math.min(100, Math.round((ratio / 4) * 100)) : 0;
            const thresholdMeta = getPollutantThresholdMeta(ratio);
            return (
              <div
                key={p.code}
                className={`p-4 bg-white border-slate-200 ${
                  idx > 0 ? 'border-t sm:border-t' : ''
                } sm:border-r`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{p.label}</div>
                    <div className="text-xs text-slate-600">{p.fullName}</div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono tabular-nums text-lg font-bold text-slate-900">
                      {p.value !== null ? p.value : '—'}
                    </span>
                    <span className="text-[11px] text-slate-600 ml-1">{p.unit}</span>
                  </div>
                </div>

                <div
                  className="mt-3 h-2 w-full bg-slate-100 rounded-full overflow-hidden"
                  role="progressbar"
                  aria-label={`${p.label} level relative to WHO guideline`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={barPct}
                  aria-valuetext={thresholdMeta.statusText}
                >
                  <div
                    className={`h-full rounded-full ${thresholdMeta.barClass}`}
                    style={{ width: `${barPct}%` }}
                  />
                </div>

                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-slate-600">
                    WHO guide:{' '}
                    <span className="font-mono text-slate-800">
                      {p.whoBenchmark} {p.unit}
                    </span>
                  </span>
                  <span className={`font-semibold ${thresholdMeta.textClass}`}>
                    {thresholdMeta.statusText}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                  {p.plainExplanation}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Trends Chart */}
      <TrendChart snapshot={snapshot} aqiStandard={prefs.aqiStandard} />
    </div>
  );
}
