import { useEffect, useMemo, useState } from 'react';
import { Download, Info, Plus, Shield, Trash2 } from 'lucide-react';
import type {
  AirQualitySnapshot,
  AqiStandard,
  ExposureLogEntry,
} from '../types/airQuality.ts';
import { getActiveAqiValue } from '../utils/aqi.ts';
import { validateExposureLogInput } from '../utils/validation.ts';

interface ExposureTrackerViewProps {
  snapshot: AirQualitySnapshot | null;
  aqiStandard: AqiStandard;
  logs: ExposureLogEntry[];
  onAddLog: (entry: ExposureLogEntry) => void;
  onDeleteLog: (id: string) => void;
  onClearAllLogs: () => void;
}

export function ExposureTrackerView({
  snapshot,
  aqiStandard,
  logs,
  onAddLog,
  onDeleteLog,
  onClearAllLogs,
}: ExposureTrackerViewProps) {
  const defaultAqi = snapshot ? getActiveAqiValue(snapshot, aqiStandard) ?? 80 : 80;
  const [duration, setDuration] = useState(30);
  const [activity, setActivity] = useState('Walking / Commute');
  const [approxAqi, setApproxAqi] = useState(defaultAqi);
  const [transportMode, setTransportMode] = useState('Walking');
  const [usedMask, setUsedMask] = useState(false);
  const [notes, setNotes] = useState('');
  const [timeOfDay, setTimeOfDay] = useState('08:30');
  const [confirmClear, setConfirmClear] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [loggedSuccess, setLoggedSuccess] = useState(false);

  useEffect(() => {
    setApproxAqi(defaultAqi);
  }, [snapshot?.location.id, defaultAqi]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateExposureLogInput({ activity, duration, approxAqi });
    if (!check.valid || !check.value) {
      setFormError(check.error ?? 'Please verify your entry.');
      return;
    }
    setFormError(null);
    const entry: ExposureLogEntry = {
      id: `log-${Date.now()}`,
      dateIso: new Date().toISOString().slice(0, 10),
      timeOfDay,
      locationName: snapshot?.location.name ?? 'Custom Location',
      activity: check.value.activity,
      durationMinutes: check.value.durationMinutes,
      approximateAqi: check.value.approximateAqi,
      aqiStandard,
      transportMode,
      usedMask,
      maskType: usedMask ? 'N95 / FFP2' : undefined,
      notes: notes.trim(),
    };
    onAddLog(entry);
    setNotes('');
    setLoggedSuccess(true);
  };

  const weeklySummary = useMemo(() => {
    const totalMinutes = logs.reduce((sum, l) => sum + l.durationMinutes, 0);
    const highAqiLogs = logs.filter((l) => l.approximateAqi > 150);
    const maskedCount = logs.filter((l) => l.usedMask).length;
    const avgAqi =
      logs.length > 0
        ? Math.round(logs.reduce((s, l) => s + l.approximateAqi, 0) / logs.length)
        : 0;

    // Group by time-of-day window to detect high-exposure periods
    const buckets = {
      Morning: { mins: 0, aqiSum: 0, count: 0 },
      Midday: { mins: 0, aqiSum: 0, count: 0 },
      Evening: { mins: 0, aqiSum: 0, count: 0 },
    };
    for (const l of logs) {
      const hour = Number((l.timeOfDay || '12:00').split(':')[0]);
      const key = hour < 11 ? 'Morning' : hour < 17 ? 'Midday' : 'Evening';
      buckets[key].mins += l.durationMinutes;
      buckets[key].aqiSum += l.approximateAqi;
      buckets[key].count += 1;
    }
    const peakPeriod = (Object.entries(buckets) as Array<[string, { mins: number; aqiSum: number; count: number }]>)
      .filter(([, b]) => b.count > 0)
      .sort((a, b) => b[1].aqiSum / b[1].count - a[1].aqiSum / a[1].count)[0];

    const recommendation =
      highAqiLogs.length > 0 && maskedCount < highAqiLogs.length
        ? 'You logged outdoor sessions above AQI 150 without a mask. Consider N95/FFP2 protection or shifting workouts indoors on poor-air days.'
        : peakPeriod && peakPeriod[0] !== 'Midday'
        ? `Your highest logged AQI averages occur in the ${peakPeriod[0].toLowerCase()}. Shifting non-essential errands toward midday may lower exposure.`
        : 'Continue pacing outdoor sessions on quieter side streets and monitoring morning AQI updates.';

    return { totalMinutes, highAqiLogs, maskedCount, avgAqi, peakPeriod, recommendation };
  }, [logs]);

  const handleExportJson = () => {
    if (typeof URL.createObjectURL !== 'function') return;
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `breathewise-exposure-logs-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Personal Exposure Awareness Tracker</h1>
            <p className="text-xs text-slate-500 mt-1">
              Log outdoor time and approximate conditions to spot high-exposure patterns across your week.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportJson}
              disabled={logs.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              Export Logs
            </button>
            {logs.length > 0 && !confirmClear && (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 border border-red-200 rounded-lg hover:bg-red-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete All Logs
              </button>
            )}
            {confirmClear && (
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    onClearAllLogs();
                    setConfirmClear(false);
                  }}
                  className="px-3 py-1.5 bg-red-600 text-white rounded-lg font-medium"
                >
                  Confirm Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="px-2 py-1.5 text-slate-600"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Scientific caveat */}
        <div className="mt-4 p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
          <p>
            <strong>Approximate Indicator Only:</strong> Ambient AQI and logged outdoor duration are
            only rough exposure-awareness indicators—they are <strong>not</strong> medically precise
            measurements and do not calculate individual inhaled pollutant dose. Stored strictly in
            your browser.
          </p>
        </div>

        {/* Summary metrics */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-slate-200 bg-white">
            <div className="text-xs text-slate-500">Logged Outdoor Time</div>
            <div className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1">
              {weeklySummary.totalMinutes} <span className="text-xs font-normal text-slate-500">min</span>
            </div>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-white">
            <div className="text-xs text-slate-500">Average Logged AQI</div>
            <div className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1">
              {logs.length > 0 ? weeklySummary.avgAqi : '—'}
            </div>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-white">
            <div className="text-xs text-slate-500">High-AQI Sessions (&gt;150)</div>
            <div className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1">
              {weeklySummary.highAqiLogs.length}{' '}
              <span className="text-xs font-normal text-slate-500">
                ({weeklySummary.maskedCount} masked)
              </span>
            </div>
          </div>
        </div>

        {logs.length > 0 && (
          <div className="mt-4 p-4 rounded-xl bg-teal-50/60 border border-teal-200 text-xs text-teal-950 space-y-1">
            <div>
              <strong>Pattern & Reduction Guidance:</strong> {weeklySummary.recommendation}
            </div>
            {weeklySummary.peakPeriod && (
              <div className="text-teal-900">
                Highest average AQI window in your logs:{' '}
                <strong>{weeklySummary.peakPeriod[0]}</strong> (avg AQI{' '}
                <span className="font-mono">
                  {Math.round(
                    weeklySummary.peakPeriod[1].aqiSum / weeklySummary.peakPeriod[1].count
                  )}
                </span>
                ).
              </div>
            )}
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Log form */}
          <form
            noValidate
            onSubmit={handleSubmit}
            className="lg:col-span-4 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
          >
            <h2 className="text-sm font-semibold text-slate-900">Log Outdoor Session</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="exposure-duration" className="block text-xs font-medium text-slate-700 mb-1">
                  Duration (min)
                </label>
                <input
                  id="exposure-duration"
                  type="number"
                  min={1}
                  max={720}
                  aria-invalid={Boolean(formError)}
                  aria-describedby={formError ? 'exposure-form-error' : undefined}
                  value={Number.isNaN(duration) ? '' : duration}
                  onChange={(e) => {
                    setDuration(e.target.value === '' ? NaN : Number(e.target.value));
                    setLoggedSuccess(false);
                    if (formError) setFormError(null);
                  }}
                  className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                />
              </div>
              <div>
                <label htmlFor="exposure-time" className="block text-xs font-medium text-slate-700 mb-1">
                  Time
                </label>
                <input
                  id="exposure-time"
                  type="time"
                  value={timeOfDay}
                  onChange={(e) => setTimeOfDay(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="exposure-activity" className="block text-xs font-medium text-slate-700 mb-1">
                  Activity
                </label>
                <input
                  id="exposure-activity"
                  type="text"
                  aria-invalid={Boolean(formError)}
                  aria-describedby={formError ? 'exposure-form-error' : undefined}
                  value={activity}
                  onChange={(e) => {
                    setActivity(e.target.value);
                    setLoggedSuccess(false);
                    if (formError) setFormError(null);
                  }}
                  className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                />
              </div>
              <div>
                <label htmlFor="exposure-aqi" className="block text-xs font-medium text-slate-700 mb-1">
                  Approx. AQI
                </label>
                <input
                  id="exposure-aqi"
                  type="number"
                  min={0}
                  max={500}
                  aria-invalid={Boolean(formError)}
                  aria-describedby={formError ? 'exposure-form-error' : undefined}
                  value={Number.isNaN(approxAqi) ? '' : approxAqi}
                  onChange={(e) => {
                    setApproxAqi(e.target.value === '' ? NaN : Number(e.target.value));
                    setLoggedSuccess(false);
                    if (formError) setFormError(null);
                  }}
                  className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                />
              </div>
            </div>
            <div>
              <label htmlFor="exposure-mode" className="block text-xs font-medium text-slate-700 mb-1">
                Transport Mode
              </label>
              <select
                id="exposure-mode"
                value={transportMode}
                onChange={(e) => setTransportMode(e.target.value)}
                className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="Walking">Walking</option>
                <option value="Cycling">Cycling</option>
                <option value="Public Transit">Public Transit</option>
                <option value="Car / Rideshare">Car / Rideshare</option>
                <option value="Outdoor Stationary">Outdoor Stationary / Park</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={usedMask}
                onChange={(e) => setUsedMask(e.target.checked)}
                className="rounded border-slate-300"
              />
              Wore N95 / FFP2 mask (optional)
            </label>
            <div>
              <label htmlFor="exposure-notes" className="block text-xs font-medium text-slate-700 mb-1">
                Notes (Optional)
              </label>
              <input
                id="exposure-notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., Heavy traffic near intersection"
                className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              />
            </div>
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Exposure Log
            </button>
            {formError && (
              <p id="exposure-form-error" className="text-xs text-red-700" role="alert">
                {formError}
              </p>
            )}
            {loggedSuccess && (
              <p role="status" className="text-xs text-teal-800 font-medium">
                Outdoor session added to your exposure log.
              </p>
            )}
          </form>

          {/* Activity History & Simple Pattern Bars */}
          <div className="lg:col-span-8 space-y-4">
            {logs.length === 0 ? (
              <div className="p-10 border border-slate-200 rounded-xl text-center">
                <Shield className="w-8 h-8 text-slate-500 mx-auto mb-2" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-slate-900">No Exposure Logs Yet</h3>
                <p className="text-xs text-slate-600 mt-1">
                  Log your first outdoor trip or walk to see weekly patterns and reduction tips.
                </p>
              </div>
            ) : (
              <>
                <div className="p-4 rounded-xl border border-slate-200 bg-white">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-3">
                    Recent Sessions (Duration × Ambient AQI Context)
                  </h3>
                  <div className="space-y-2.5">
                    {logs.slice(0, 6).map((l) => {
                      const barWidth = Math.min(100, Math.round((l.durationMinutes / 120) * 100));
                      const barTone =
                        l.approximateAqi > 150
                          ? 'bg-red-600'
                          : l.approximateAqi > 100
                          ? 'bg-amber-500'
                          : 'bg-teal-600';
                      const riskTag =
                        l.approximateAqi > 150
                          ? 'High AQI'
                          : l.approximateAqi > 100
                          ? 'Elevated AQI'
                          : 'Moderate/Good AQI';
                      return (
                        <div key={l.id} className="space-y-1">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="font-medium text-slate-800">
                              {l.dateIso} {l.timeOfDay} · {l.activity}
                            </span>
                            <span className="font-mono tabular-nums text-slate-700">
                              {l.durationMinutes} min · AQI {l.approximateAqi} ({riskTag})
                            </span>
                          </div>
                          <div
                            className="h-2 bg-slate-100 rounded-full overflow-hidden"
                            role="progressbar"
                            aria-label={`${l.activity} duration ${l.durationMinutes} minutes`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={barWidth}
                          >
                            <div className={`h-full ${barTone}`} style={{ width: `${barWidth}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {logs.map((entry) => (
                    <div
                      key={entry.id}
                      className="p-3.5 flex items-start justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="font-semibold text-slate-900">
                          {entry.activity} ·{' '}
                          <span className="font-mono tabular-nums">
                            {entry.durationMinutes} min
                          </span>
                        </div>
                        <div className="text-slate-600 mt-0.5">
                          {entry.dateIso} at {entry.timeOfDay} · {entry.locationName} ·{' '}
                          {entry.transportMode} · Approx AQI {entry.approximateAqi}
                          {entry.usedMask ? ' · Mask used' : ''}
                        </div>
                        {entry.notes && <p className="text-slate-700 mt-1">{entry.notes}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteLog(entry.id)}
                        aria-label={`Delete ${entry.activity} log entry`}
                        className="p-2 min-w-[38px] min-h-[38px] flex items-center justify-center text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-md shrink-0"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
