import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { AiErrorBanner } from './UiFeedback.tsx';
import {
  evaluateActivityGuidance,
  OUTDOOR_ACTIVITIES,
} from '../data/educationContent.ts';
import { useAsyncAction } from '../hooks/useAsyncAction.ts';
import {
  buildAiContextPayload,
  buildDemoOutdoorActivityAi,
  requestStructuredAiApi,
} from '../services/apiClient.ts';
import type {
  AirQualitySnapshot,
  AqiCategoryMeta,
  ExposureLogEntry,
  IndoorHomeProfile,
  OutdoorActivityAiResult,
  SustainabilityGoal,
  UserPreferences,
} from '../types/airQuality.ts';

interface OutdoorActivityPanelProps {
  snapshot: AirQualitySnapshot | null;
  category: AqiCategoryMeta;
  prefs: UserPreferences;
  homeProfile?: IndoorHomeProfile;
  sustainabilityGoals?: SustainabilityGoal[];
  exposureLogs?: ExposureLogEntry[];
  geminiConfigured: boolean;
}

export function OutdoorActivityPanel({
  snapshot,
  category,
  prefs,
  homeProfile,
  sustainabilityGoals,
  exposureLogs,
  geminiConfigured,
}: OutdoorActivityPanelProps) {
  const [selectedActivityId, setSelectedActivityId] = useState(OUTDOOR_ACTIVITIES[0].id);
  const [activityAiMap, setActivityAiMap] = useState<Record<string, OutdoorActivityAiResult>>({});
  const activityAction = useAsyncAction(
    'Unable to personalize outdoor activity decision right now.'
  );

  const selectedActivity =
    OUTDOOR_ACTIVITIES.find((a) => a.id === selectedActivityId) ?? OUTDOOR_ACTIVITIES[0];
  const activityEval = evaluateActivityGuidance(
    selectedActivity,
    category.id,
    snapshot?.currentUsAqi ?? null
  );
  const selectedActivityAi = activityAiMap[selectedActivity.id] ?? null;

  const handleGenerateActivityAi = async (forceRefresh = false) => {
    if (!snapshot) return;
    activityAction.clearError();
    const targetActivity = selectedActivity;

    if (prefs.demoMode || !geminiConfigured) {
      const demo = buildDemoOutdoorActivityAi({
        activityName: targetActivity.name,
        intensity: targetActivity.intensity,
        indoorAltTitle: targetActivity.indoorAlternativeTitle,
        indoorAltDetails: targetActivity.indoorAlternativeDetails,
        riskLevel: activityEval.riskLevel,
        snapshot,
        standard: prefs.aqiStandard,
      });
      setActivityAiMap((prev) => ({ ...prev, [targetActivity.id]: demo }));
      return;
    }

    const res = await activityAction.run(async () => {
      const ctx = buildAiContextPayload({
        snapshot,
        prefs,
        indoorProfile: homeProfile,
        sustainabilityGoals,
        exposureLogs,
      });
      return requestStructuredAiApi<OutdoorActivityAiResult>({
        taskType: 'outdoor-activity',
        context: ctx,
        payload: {
          activityName: targetActivity.name,
          exertionIntensity: targetActivity.intensity,
          deterministicRiskLevel: activityEval.riskLevel,
          deterministicTiming: activityEval.recommendedTiming,
          deterministicDuration: activityEval.durationGuidance,
          indoorAlternative: targetActivity.indoorAlternativeTitle,
        },
        forceRefresh,
      });
    });

    if (res) {
      setActivityAiMap((prev) => ({
        ...prev,
        [targetActivity.id]: { ...res, isAiGenerated: true },
      }));
    }
  };

  return (
    <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-5 space-y-2">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">
          Select an Activity to Evaluate
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
          {OUTDOOR_ACTIVITIES.map((act) => {
            const evalItem = evaluateActivityGuidance(
              act,
              category.id,
              snapshot?.currentUsAqi ?? null
            );
            const active = act.id === selectedActivity.id;
            return (
              <button
                key={act.id}
                type="button"
                aria-pressed={active}
                onClick={() => setSelectedActivityId(act.id)}
                className={`p-3.5 min-h-[54px] rounded-lg border text-left flex items-center justify-between transition-colors ${
                  active
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-800'
                }`}
              >
                <div>
                  <div className="text-sm font-medium">{act.name}</div>
                  <div className={`text-[11px] ${active ? 'text-slate-300' : 'text-slate-500'}`}>
                    {act.intensity} exertion
                  </div>
                </div>
                <span
                  className={`text-xs font-semibold ${
                    active ? 'text-teal-300' : 'text-slate-700'
                  }`}
                >
                  {evalItem.riskLevel} Risk
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="lg:col-span-7 space-y-4">
        <div className="p-5 rounded-xl border border-slate-200 bg-white space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-bold text-slate-900">{selectedActivity.name}</h2>
              <p className="text-xs text-slate-500">Assessed under {category.label} conditions</p>
            </div>
            <span
              className={`px-3 py-1 rounded-md border text-xs font-semibold ${category.bgClass} ${category.borderClass} ${category.textClass}`}
            >
              {activityEval.riskLevel} Exposure Risk
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-slate-50">
              <div className="font-semibold text-slate-900">Recommended Timing</div>
              <p className="text-slate-600 mt-1">{activityEval.recommendedTiming}</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50">
              <div className="font-semibold text-slate-900">Duration Guidance</div>
              <p className="text-slate-600 mt-1">{activityEval.durationGuidance}</p>
            </div>
          </div>

          <div className="text-xs space-y-1.5">
            <div className="font-semibold text-slate-900">Practical Precautions</div>
            <ul className="list-disc list-inside text-slate-600 space-y-1">
              {activityEval.precautions.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>

          <div className="text-xs text-slate-600 pt-2 border-t border-slate-100">
            <strong className="text-slate-800">Why this guidance:</strong> {activityEval.explanation}{' '}
            Area-wide AQI may not capture localized traffic or smoke sources.
          </div>
        </div>

        <div className="p-5 rounded-xl border border-teal-200 bg-teal-50 text-teal-950">
          <div className="text-xs font-semibold uppercase tracking-wider text-teal-800">
            Indoor Alternative Generator
          </div>
          <h3 className="text-base font-bold mt-1">{selectedActivity.indoorAlternativeTitle}</h3>
          <p className="text-xs text-teal-900 mt-1.5 leading-relaxed">
            {selectedActivity.indoorAlternativeDetails}
          </p>
        </div>

        {/* AI Outdoor Activity Decision Card (Workflow 4) */}
        <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/80 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Personalized Activity Decision
              </h3>
              <p className="text-[11px] text-slate-500">
                Weighs {selectedActivity.name.toLowerCase()} intensity against hourly AQI windows,
                weather, and your household context.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleGenerateActivityAi(false)}
              disabled={activityAction.loading || !snapshot}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-50 whitespace-nowrap"
            >
              {activityAction.loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-teal-300" />
              )}
              {geminiConfigured && !prefs.demoMode
                ? `Tailor ${selectedActivity.name} (Gemini)`
                : `Simulate Decision (Demo)`}
            </button>
          </div>

          {activityAction.error && (
            <AiErrorBanner
              error={activityAction.error}
              retryLabel="Retry"
              onRetry={() => handleGenerateActivityAi(true)}
            />
          )}

          {selectedActivityAi && (
            <div className="p-4 rounded-lg bg-white border border-slate-200 space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-900">{selectedActivityAi.verdict}</span>
                <span className="text-[11px] text-slate-500 shrink-0">
                  {selectedActivityAi.isDemoMock ? 'Demo simulation' : 'Gemini decision'}
                </span>
              </div>
              <div className="p-2.5 rounded bg-slate-50 text-slate-700">
                <strong className="text-slate-900">Timing window:</strong>{' '}
                {selectedActivityAi.bestTimeWindow}
              </div>
              <p className="text-slate-600">{selectedActivityAi.whyBasedOnReadings}</p>
              {selectedActivityAi.breathingPrecautions.length > 0 && (
                <ul className="list-disc list-inside text-slate-700 space-y-0.5">
                  {selectedActivityAi.breathingPrecautions.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              )}
              <div className="text-slate-700">
                <strong className="text-slate-900">Indoor backup:</strong>{' '}
                {selectedActivityAi.indoorAlternativePlan}
              </div>
              <p className="text-[11px] text-slate-500 pt-1.5 border-t border-slate-100">
                {selectedActivityAi.dataLimitationNote}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
