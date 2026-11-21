import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Info,
  MapPin,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { DashboardHero } from '../components/DashboardHero.tsx';
import { PollutantBreakdownSection } from '../components/PollutantBreakdownSection.tsx';
import { SevereSmogBanner } from '../components/SevereSmogBanner.tsx';
import { TrendChart } from '../components/TrendChart.tsx';
import { useLocalStorage } from '../hooks/useLocalStorage.ts';
import type {
  AirQualitySnapshot,
  DailyPlanItem,
  NavSection,
  UserPreferences,
} from '../types/airQuality.ts';
import { getActiveAqiValue, getAqiCategory } from '../utils/aqi.ts';

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
  const isSevereSmog = (snapshot.currentUsAqi ?? 0) >= 200;
  const priorityActionsToday = dailyPlan.slice(0, 3);

  return (
    <div className="space-y-6">
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

      <DashboardHero
        snapshot={snapshot}
        activeAqi={activeAqi}
        category={category}
        prefs={prefs}
        primaryReading={primaryReading}
        onNavigate={onNavigate}
      />

      {isSevereSmog && (
        <SevereSmogBanner
          currentUsAqi={snapshot.currentUsAqi}
          checks={smogChecks}
          onToggleCheck={(key, nextValue) =>
            setSmogChecks((p) => ({ ...p, [key]: nextValue }))
          }
          onOpenFamilyShield={() => onNavigate('family')}
        />
      )}

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

      <PollutantBreakdownSection
        pollutants={snapshot.pollutants}
        attribution={snapshot.attribution}
      />

      <TrendChart snapshot={snapshot} aqiStandard={prefs.aqiStandard} />
    </div>
  );
}
