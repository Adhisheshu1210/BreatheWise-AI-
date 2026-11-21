import { useMemo, useState } from 'react';
import { Info, Loader2, Navigation2, Sparkles } from 'lucide-react';
import { AiErrorBanner } from '../components/UiFeedback.tsx';
import {
  buildAiContextPayload,
  buildDemoCommuteAi,
  requestStructuredAiApi,
} from '../services/apiClient.ts';
import type {
  AirQualitySnapshot,
  AqiStandard,
  CommuteAiResult,
  IndoorHomeProfile,
  UserPreferences,
} from '../types/airQuality.ts';
import { getActiveAqiValue, getAqiCategory } from '../utils/aqi.ts';
import { validateCommuteInput } from '../utils/validation.ts';

interface CommuteAssistantViewProps {
  snapshot: AirQualitySnapshot | null;
  aqiStandard: AqiStandard;
  prefs: UserPreferences;
  homeProfile?: IndoorHomeProfile;
  geminiConfigured: boolean;
}

type Mode = 'walking' | 'cycling' | 'public_transit' | 'carpool' | 'private_car';
type TravelTime = 'early_morning' | 'morning_rush' | 'midday' | 'evening_rush' | 'night';

export function CommuteAssistantView({
  snapshot,
  aqiStandard,
  prefs,
  homeProfile,
  geminiConfigured,
}: CommuteAssistantViewProps) {
  const [origin, setOrigin] = useState('Home Neighborhood');
  const [destination, setDestination] = useState('Workplace / School Campus');
  const [distanceKm, setDistanceKm] = useState<number>(6);
  const [mode, setMode] = useState<Mode>('public_transit');
  const [travelTime, setTravelTime] = useState<TravelTime>('morning_rush');
  const [preferQuietStreets, setPreferQuietStreets] = useState(true);
  const [commuteAi, setCommuteAi] = useState<CommuteAiResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const aqi = snapshot ? getActiveAqiValue(snapshot, aqiStandard) : null;
  const cat = aqi !== null ? getAqiCategory(aqi, aqiStandard) : null;
  const isHighAqi = snapshot && snapshot.currentUsAqi !== null ? snapshot.currentUsAqi > 150 : false;
  const validation = validateCommuteInput({ origin, destination, distanceKm });
  const safeDistanceKm =
    Number.isFinite(distanceKm) && distanceKm >= 0.5 && distanceKm <= 100 ? distanceKm : 1;

  const comparison = useMemo(() => {
    const rushMultiplier =
      travelTime === 'morning_rush' || travelTime === 'evening_rush' ? 1.25 : 1.0;

    const mainRoadTimeMin =
      mode === 'walking'
        ? Math.round(safeDistanceKm * 12)
        : mode === 'cycling'
        ? Math.round(safeDistanceKm * 4)
        : mode === 'public_transit'
        ? Math.round(safeDistanceKm * 3.2 + 8)
        : Math.round(safeDistanceKm * 2.8 * rushMultiplier);

    const quietStreetTimeMin =
      mode === 'walking' || mode === 'cycling'
        ? Math.round(mainRoadTimeMin * 1.12)
        : Math.round(mainRoadTimeMin * 1.08);

    const arterialExposure = !snapshot
      ? 'Select a city or Demo Mode to pair roadside exposure with live/demo AQI'
      : mode === 'walking' || mode === 'cycling'
      ? isHighAqi
        ? 'High (unfiltered roadside breathing + heavy exhaust proximity)'
        : 'Moderate-Elevated (close to arterial tailpipe emissions)'
      : 'Moderate (cabin air mixes with heavy road exhaust)';

    const quietExposure = !snapshot
      ? 'Quiet side streets generally reduce direct diesel exhaust proximity'
      : mode === 'walking' || mode === 'cycling'
      ? isHighAqi
        ? 'Elevated (quieter streets reduce tailpipe NO₂, though ambient PM2.5 remains high)'
        : 'Lower relative roadside exposure (set back from diesel traffic)'
      : 'Lower relative exposure (reduces stop-and-go exhaust queuing)';

    const transitExposure = !snapshot
      ? 'Lower per-passenger emissions; select a city for ambient mask guidance'
      : isHighAqi
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
      mainRoadTimeMin,
      quietStreetTimeMin,
      arterialExposure,
      quietExposure,
      transitExposure,
      carCo2Range,
      transitCo2Range,
    };
  }, [safeDistanceKm, mode, travelTime, isHighAqi, snapshot]);

  const handleGenerateCommuteAi = async (forceRefresh = false) => {
    if (!validation.valid || !validation.value) return;
    setAiError(null);

    if (prefs.demoMode || !geminiConfigured || !snapshot) {
      setCommuteAi(
        buildDemoCommuteAi({
          origin: origin.trim(),
          destination: destination.trim(),
          distanceKm: safeDistanceKm,
          mode,
          travelTime,
          snapshot,
          standard: aqiStandard,
        })
      );
      return;
    }

    setAiLoading(true);
    try {
      const ctx = buildAiContextPayload({
        snapshot,
        prefs,
        indoorProfile: homeProfile,
      });
      const res = await requestStructuredAiApi<CommuteAiResult>({
        taskType: 'commute-advice',
        context: ctx,
        payload: {
          origin: origin.trim(),
          destination: destination.trim(),
          distanceKm: safeDistanceKm,
          primaryMode: mode,
          travelWindow: travelTime,
          preferQuietStreets,
          estimatedMainRoadMin: comparison.mainRoadTimeMin,
          estimatedQuietStreetMin: comparison.quietStreetTimeMin,
          estimatedTransitCo2KgRange: comparison.transitCo2Range,
          estimatedCarCo2KgRange: comparison.carCo2Range,
        },
        forceRefresh,
      });
      setCommuteAi({ ...res, isAiGenerated: true });
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : 'Unable to personalize commute strategy right now.'
      );
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Smart Route & Commute Assistant</h1>
            <p className="text-xs text-slate-500 mt-1">
              {snapshot && cat ? (
                <>
                  Compare exposure, traffic timing, and emissions across travel choices for{' '}
                  <strong className="text-slate-800">{snapshot.location.name}</strong> ({cat.label}).
                </>
              ) : (
                'Compare travel time and emissions assumptions — select a city or Demo Mode to add ambient AQI context.'
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleGenerateCommuteAi(false)}
            disabled={aiLoading || !validation.valid}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-50 whitespace-nowrap self-start md:self-auto"
          >
            {aiLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 text-teal-300" />
            )}
            {geminiConfigured && !prefs.demoMode && snapshot
              ? 'Personalize Strategy (Gemini)'
              : 'Simulate Strategy (Demo)'}
          </button>
        </div>

        <div className="mt-4 p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-950 text-xs flex items-start gap-2.5">
          <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <p>
            <strong>Transparent Assumption Mode:</strong> Live street-by-street routing and live road
            traffic sensors are not connected. Travel times, exposure comparisons, and emission
            ranges below are transparent educational estimates based on distance, mode, and{' '}
            {aqi !== null ? `current city AQI (${aqi})` : 'unavailable city AQI (no location selected)'}.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3.5">
            <h2 className="text-sm font-semibold text-slate-900">Trip Details</h2>
            <div>
              <label htmlFor="commute-origin" className="block text-xs font-medium text-slate-700 mb-1">
                Starting Point
              </label>
              <input
                id="commute-origin"
                type="text"
                aria-invalid={!validation.valid}
                aria-describedby={!validation.valid ? 'commute-validation-error' : undefined}
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                placeholder="e.g., Home Neighborhood"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              />
            </div>
            <div>
              <label htmlFor="commute-destination" className="block text-xs font-medium text-slate-700 mb-1">
                Destination
              </label>
              <input
                id="commute-destination"
                type="text"
                aria-invalid={!validation.valid}
                aria-describedby={!validation.valid ? 'commute-validation-error' : undefined}
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="e.g., Office / School"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="commute-distance" className="block text-xs font-medium text-slate-700 mb-1">
                  Est. Distance (km)
                </label>
                <input
                  id="commute-distance"
                  type="number"
                  min={0.5}
                  max={100}
                  step={0.5}
                  aria-invalid={!validation.valid}
                  aria-describedby={!validation.valid ? 'commute-validation-error' : undefined}
                  value={Number.isNaN(distanceKm) ? '' : distanceKm}
                  onChange={(e) =>
                    setDistanceKm(e.target.value === '' ? NaN : Number(e.target.value))
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                />
              </div>
              <div>
                <label htmlFor="commute-window" className="block text-xs font-medium text-slate-700 mb-1">
                  Travel Window
                </label>
                <select
                  id="commute-window"
                  value={travelTime}
                  onChange={(e) => setTravelTime(e.target.value as TravelTime)}
                  className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="early_morning">Early Morning</option>
                  <option value="morning_rush">Morning Rush</option>
                  <option value="midday">Midday</option>
                  <option value="evening_rush">Evening Rush</option>
                  <option value="night">Night</option>
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="commute-mode" className="block text-xs font-medium text-slate-700 mb-1">
                Primary Mode
              </label>
              <select
                id="commute-mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as Mode)}
                className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="public_transit">Public Transit (Metro / Bus)</option>
                <option value="walking">Walking</option>
                <option value="cycling">Cycling</option>
                <option value="carpool">Carpool</option>
                <option value="private_car">Private Car</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={preferQuietStreets}
                onChange={(e) => setPreferQuietStreets(e.target.checked)}
                className="rounded border-slate-300 w-4 h-4 accent-teal-700"
              />
              Prioritize quieter residential streets over shortest path
            </label>
            {!validation.valid && validation.error && (
              <p id="commute-validation-error" className="text-xs text-red-700" role="alert">
                {validation.error}
              </p>
            )}
          </div>

          <div className="lg:col-span-8 space-y-4">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <Navigation2 className="w-4 h-4 text-teal-700" />
              <span>
                Comparing options from <strong>{origin.trim() || 'Origin'}</strong> to{' '}
                <strong>{destination.trim() || 'Destination'}</strong> ({safeDistanceKm} km est.)
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Option 1 */}
              <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2.5">
                <div className="text-xs font-semibold text-slate-500">Main Arterial Route</div>
                <div className="font-mono tabular-nums text-xl font-bold text-slate-900">
                  ~{comparison.mainRoadTimeMin} min
                </div>
                <div className="text-xs text-slate-700">
                  <strong>Exposure:</strong> {comparison.arterialExposure}
                </div>
                <div className="text-xs text-slate-600">
                  <strong>Traffic note:</strong> Heavy diesel buses & idling congestion increase
                  roadside NO₂ and soot.
                </div>
              </div>

              {/* Option 2 */}
              <div
                className={`p-4 rounded-xl border space-y-2.5 ${
                  preferQuietStreets
                    ? 'border-teal-500 bg-teal-50/40'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="text-xs font-semibold text-teal-800">
                  Quieter Side-Street Path
                </div>
                <div className="font-mono tabular-nums text-xl font-bold text-slate-900">
                  ~{comparison.quietStreetTimeMin} min
                </div>
                <div className="text-xs text-slate-700">
                  <strong>Exposure:</strong> {comparison.quietExposure}
                </div>
                <div className="text-xs text-slate-600">
                  <strong>Why consider:</strong> Stepping 1–2 blocks off main roads lowers direct
                  exhaust plume concentration.
                </div>
              </div>

              {/* Option 3 */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2.5">
                <div className="text-xs font-semibold text-slate-800">
                  {isHighAqi ? 'Enclosed Transit + Mask' : 'Shared Transit / Active Mix'}
                </div>
                <div className="font-mono tabular-nums text-xl font-bold text-slate-900">
                  ~{Math.round(safeDistanceKm * 3.2 + 8)} min
                </div>
                <div className="text-xs text-slate-700">
                  <strong>Exposure:</strong> {comparison.transitExposure}
                </div>
                <div className="text-xs text-slate-600">
                  <strong>Est. tailpipe CO₂e:</strong> {comparison.transitCo2Range[0]}–
                  {comparison.transitCo2Range[1]} kg vs {comparison.carCo2Range[0]}–
                  {comparison.carCo2Range[1]} kg solo car (illustrative range).
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-white text-xs text-slate-700 space-y-1.5">
              <div className="font-semibold text-slate-900">
                Mode & Timing Guidance for {travelTime.replace('_', ' ')}
              </div>
              <p>
                {isHighAqi
                  ? 'Because outdoor AQI is above 150, prolonged outdoor cycling or brisk walking increases breathing volume significantly. Consider enclosed public transit or carpool and wear a well-fitted N95/FFP2 respirator during outdoor segments.'
                  : travelTime === 'morning_rush' || travelTime === 'evening_rush'
                  ? 'Rush-hour traffic raises street-level NO₂ and brake/exhaust particles. If using a car, engage cabin air recirculation at congested junctions; if walking, choose parallel tree-lined streets.'
                  : 'Midday off-peak travel generally encounters lighter traffic queues and stronger atmospheric mixing than rush hours.'}
              </p>
            </div>

            {aiError && (
              <AiErrorBanner error={aiError} onRetry={() => handleGenerateCommuteAi(true)} />
            )}

            {commuteAi && (
              <div className="p-4 rounded-xl border border-teal-200 bg-teal-50/40 space-y-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-slate-900">Personalized Commute Recommendation</strong>
                  <span className="text-[11px] text-slate-500">
                    {commuteAi.isDemoMock ? 'Demo simulation' : 'Gemini tailored'}
                  </span>
                </div>
                <p className="font-medium text-slate-900">{commuteAi.recommendedOption}</p>
                <p className="text-slate-700">
                  <strong>Timing:</strong> {commuteAi.timingAdjustment}
                </p>
                {commuteAi.exposureReductionSteps.length > 0 && (
                  <ul className="list-disc list-inside text-slate-700 space-y-1">
                    {commuteAi.exposureReductionSteps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ul>
                )}
                {commuteAi.gearChecklist.length > 0 && (
                  <p className="text-slate-700">
                    <strong>Suggested kit:</strong> {commuteAi.gearChecklist.join(' · ')}
                  </p>
                )}
                <p className="text-slate-600">{commuteAi.tradeOffSummary}</p>
                <p className="text-[11px] text-slate-500 pt-1.5 border-t border-teal-200/60">
                  {commuteAi.dataLimitationNote}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
