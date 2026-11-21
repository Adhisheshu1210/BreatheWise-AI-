import { useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Edit3,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
} from 'lucide-react';
import { OutdoorActivityPanel } from '../components/OutdoorActivityPanel.tsx';
import { AiErrorBanner } from '../components/UiFeedback.tsx';
import {
  buildAiContextPayload,
  normalizeDailyPlanItems,
  requestStructuredAiApi,
} from '../services/apiClient.ts';
import type {
  AirQualitySnapshot,
  DailyPlanItem,
  ExposureLogEntry,
  IndoorHomeProfile,
  SustainabilityGoal,
  UserPreferences,
} from '../types/airQuality.ts';
import {
  buildPersonalizedDailyPlan,
  getActiveAqiValue,
  getAqiCategory,
} from '../utils/aqi.ts';

interface DailyPlannerViewProps {
  snapshot: AirQualitySnapshot | null;
  prefs: UserPreferences;
  homeProfile?: IndoorHomeProfile;
  sustainabilityGoals?: SustainabilityGoal[];
  exposureLogs?: ExposureLogEntry[];
  plan: DailyPlanItem[];
  geminiConfigured: boolean;
  onUpdatePlan: (items: DailyPlanItem[]) => void;
  onUpdatePrefs: (next: UserPreferences) => void;
}

export function DailyPlannerView({
  snapshot,
  prefs,
  homeProfile,
  sustainabilityGoals,
  exposureLogs,
  plan,
  geminiConfigured,
  onUpdatePlan,
  onUpdatePrefs,
}: DailyPlannerViewProps) {
  const [subTab, setSubTab] = useState<'routine' | 'activities'>('routine');
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [planMeta, setPlanMeta] = useState<{
    planSummary?: string;
    dataLimitationNote?: string;
  } | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ time: string; title: string; action: string }>({
    time: '',
    title: '',
    action: '',
  });

  const activeAqi = snapshot ? getActiveAqiValue(snapshot, prefs.aqiStandard) : null;
  const category = getAqiCategory(activeAqi, prefs.aqiStandard);

  const handleGenerateDeterministic = () => {
    if (!snapshot) return;
    setAiError(null);
    setPlanMeta(null);
    const items = buildPersonalizedDailyPlan({
      snapshot,
      schedule: prefs.schedule,
      role: prefs.lifestyleRole,
      hasSensitiveFamily: prefs.household.length > 0,
    });
    onUpdatePlan(items);
    setSavedNotice('Updated routine from your schedule and current air quality.');
  };

  const handleGenerateWithGemini = async (forceRefresh = false) => {
    if (!snapshot) return;
    if (prefs.demoMode || !geminiConfigured) {
      handleGenerateDeterministic();
      return;
    }
    setGenerating(true);
    setAiError(null);
    setSavedNotice(null);
    try {
      const ctx = buildAiContextPayload({
        snapshot,
        prefs,
        indoorProfile: homeProfile,
        sustainabilityGoals,
        exposureLogs,
      });
      const res = await requestStructuredAiApi<{
        planSummary?: string;
        dataLimitationNote?: string;
        items: Array<Partial<DailyPlanItem>>;
      }>({
        taskType: 'daily-plan',
        context: ctx,
        payload: {
          schedule: prefs.schedule,
          role: prefs.lifestyleRole,
          household: prefs.household,
          priorities: prefs.priorities,
        },
        forceRefresh,
      });
      onUpdatePlan(normalizeDailyPlanItems(res.items));
      setPlanMeta({
        planSummary: res.planSummary,
        dataLimitationNote: res.dataLimitationNote,
      });
      setSavedNotice('Generated personalized AI daily plan via Gemini.');
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Unable to generate AI plan right now.');
    } finally {
      setGenerating(false);
    }
  };

  const toggleCompleted = (id: string) => {
    onUpdatePlan(plan.map((item) => (item.id === id ? { ...item, completed: !item.completed } : item)));
  };

  const startEdit = (item: DailyPlanItem) => {
    setEditingId(item.id);
    setEditDraft({ time: item.time, title: item.title, action: item.action });
  };

  const saveEdit = (id: string) => {
    onUpdatePlan(
      plan.map((item) =>
        item.id === id
          ? {
              ...item,
              time: editDraft.time.trim() || item.time,
              title: editDraft.title.trim() || item.title,
              action: editDraft.action.trim() || item.action,
            }
          : item
      )
    );
    setEditingId(null);
  };

  const regenerateSingleItem = (id: string) => {
    const current = plan.find((p) => p.id === id);
    if (!current) return;

    const alternativesPool: Array<{
      title: string;
      action: string;
      alternative: string;
      explanation: string;
    }> = [
      {
        title: current.title,
        action: current.alternative,
        alternative: current.action,
        explanation:
          'Swapped to your lower-exposure alternative option while preserving your schedule window.',
      },
      {
        title: `${current.title} (Timing Shift)`,
        action:
          'Shift this activity closer to midday (12:30 PM – 2:30 PM) when morning inversion layers typically ease, or keep duration under 20 minutes.',
        alternative: 'Keep the activity indoors in a filtered room if local traffic or haze persists.',
        explanation:
          'Atmospheric mixing is frequently stronger around early afternoon compared to early morning or late evening.',
      },
      {
        title: `${current.title} (Protective Mode)`,
        action:
          'Complete essential movement along quieter parallel streets away from diesel traffic and wear a snug N95/FFP2 respirator if AQI is elevated.',
        alternative: 'Replace outdoor portion with indoor stretching, hydration, and rest.',
        explanation:
          'Stepping 1–2 blocks back from main arterial corridors lowers direct tailpipe NO₂ and soot exposure.',
      },
    ];

    const nextIdx =
      (alternativesPool.findIndex((a) => a.action === current.action) + 1) %
      alternativesPool.length;
    const chosen = alternativesPool[nextIdx];

    onUpdatePlan(
      plan.map((item) =>
        item.id === id
          ? {
              ...item,
              title: chosen.title,
              action: chosen.action,
              alternative: chosen.alternative,
              explanation: chosen.explanation,
              completed: false,
            }
          : item
      )
    );
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Smart Daily Air Quality & Activity Planner
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              {snapshot
                ? `Adapted to ${snapshot.location.name} (${
                    prefs.aqiStandard === 'eaqi' ? 'EAQI' : 'US AQI'
                  } ${activeAqi ?? 'N/A'} — ${category.label})`
                : 'Select a city to personalize your routine'}
            </p>
          </div>

          <div
            className="inline-flex items-center p-1 bg-slate-100 rounded-lg self-start"
            role="group"
            aria-label="Planner sections"
          >
            <button
              type="button"
              aria-pressed={subTab === 'routine'}
              onClick={() => setSubTab('routine')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
                subTab === 'routine'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Daily Routine
            </button>
            <button
              type="button"
              aria-pressed={subTab === 'activities'}
              onClick={() => setSubTab('activities')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
                subTab === 'activities'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Outdoor Activity Intelligence
            </button>
          </div>
        </div>

        {subTab === 'routine' ? (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Schedule inputs */}
            <div className="lg:col-span-4 space-y-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">Your Schedule & Preferences</h2>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="planner-wake" className="block text-xs font-medium text-slate-700 mb-1">
                    Wake-up
                  </label>
                  <input
                    id="planner-wake"
                    type="time"
                    value={prefs.schedule.wakeTime}
                    onChange={(e) =>
                      onUpdatePrefs({
                        ...prefs,
                        schedule: { ...prefs.schedule, wakeTime: e.target.value },
                      })
                    }
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="planner-bed" className="block text-xs font-medium text-slate-700 mb-1">
                    Bedtime
                  </label>
                  <input
                    id="planner-bed"
                    type="time"
                    value={prefs.schedule.bedTime}
                    onChange={(e) =>
                      onUpdatePrefs({
                        ...prefs,
                        schedule: { ...prefs.schedule, bedTime: e.target.value },
                      })
                    }
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="planner-work-start" className="block text-xs font-medium text-slate-700 mb-1">
                    Work/School Start
                  </label>
                  <input
                    id="planner-work-start"
                    type="time"
                    value={prefs.schedule.workStart}
                    onChange={(e) =>
                      onUpdatePrefs({
                        ...prefs,
                        schedule: { ...prefs.schedule, workStart: e.target.value },
                      })
                    }
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="planner-work-end" className="block text-xs font-medium text-slate-700 mb-1">
                    Work/School End
                  </label>
                  <input
                    id="planner-work-end"
                    type="time"
                    value={prefs.schedule.workEnd}
                    onChange={(e) =>
                      onUpdatePrefs({
                        ...prefs,
                        schedule: { ...prefs.schedule, workEnd: e.target.value },
                      })
                    }
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="planner-commute" className="block text-xs font-medium text-slate-700 mb-1">
                  Commute Mode
                </label>
                <select
                  id="planner-commute"
                  value={prefs.schedule.commuteMode}
                  onChange={(e) =>
                    onUpdatePrefs({
                      ...prefs,
                      schedule: {
                        ...prefs.schedule,
                        commuteMode: e.target.value as UserPreferences['schedule']['commuteMode'],
                      },
                    })
                  }
                  className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="public_transit">Public transit (metro / bus)</option>
                  <option value="walking">Walking</option>
                  <option value="cycling">Cycling</option>
                  <option value="carpool">Carpool</option>
                  <option value="private_car">Private car</option>
                  <option value="remote">Work / study from home</option>
                </select>
              </div>

              <div>
                <label htmlFor="planner-exercise" className="block text-xs font-medium text-slate-700 mb-1">
                  Preferred Exercise
                </label>
                <select
                  id="planner-exercise"
                  value={prefs.schedule.preferredExercise}
                  onChange={(e) =>
                    onUpdatePrefs({
                      ...prefs,
                      schedule: {
                        ...prefs.schedule,
                        preferredExercise:
                          e.target.value as UserPreferences['schedule']['preferredExercise'],
                      },
                    })
                  }
                  className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="walking">Walking</option>
                  <option value="running">Running</option>
                  <option value="cycling">Cycling</option>
                  <option value="yoga">Yoga</option>
                  <option value="gym_indoor">Indoor gym / bodyweight</option>
                  <option value="none">None scheduled</option>
                </select>
              </div>

              <div>
                <label htmlFor="planner-goal" className="block text-xs font-medium text-slate-700 mb-1">
                  Daily Goal
                </label>
                <input
                  id="planner-goal"
                  type="text"
                  value={prefs.schedule.outdoorGoals}
                  onChange={(e) =>
                    onUpdatePrefs({
                      ...prefs,
                      schedule: { ...prefs.schedule, outdoorGoals: e.target.value },
                    })
                  }
                  placeholder="e.g., Protect school commute, 30 min exercise"
                  className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                />
              </div>

              <div className="pt-2 space-y-2">
                <button
                  type="button"
                  onClick={() => handleGenerateWithGemini(false)}
                  disabled={generating || !snapshot}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-50"
                >
                  {generating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 text-teal-300" />
                  )}
                  {geminiConfigured && !prefs.demoMode
                    ? 'Generate AI Plan (Gemini)'
                    : 'Generate Personalized Plan'}
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onUpdatePlan(plan);
                      setSavedNotice('Routine saved locally in your browser.');
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save Routine
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateDeterministic}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset Plan
                  </button>
                </div>
              </div>
            </div>

            {/* Plan items */}
            <div className="lg:col-span-8 space-y-3">
              {aiError && (
                <AiErrorBanner
                  error={aiError}
                  onRetry={() => handleGenerateWithGemini(true)}
                  secondaryLabel="Use Smart Offline Plan"
                  onSecondaryAction={handleGenerateDeterministic}
                />
              )}

              {planMeta?.planSummary && (
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 space-y-1">
                  <div className="font-semibold text-slate-900">Gemini Context Summary</div>
                  <p>{planMeta.planSummary}</p>
                  {planMeta.dataLimitationNote && (
                    <p className="text-[11px] text-slate-500">{planMeta.dataLimitationNote}</p>
                  )}
                </div>
              )}

              {savedNotice && (
                <div className="p-3 rounded-lg bg-teal-50 border border-teal-200 text-teal-950 text-xs flex items-center justify-between">
                  <span>{savedNotice}</span>
                  <button
                    type="button"
                    onClick={() => setSavedNotice(null)}
                    className="text-teal-700 font-medium"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {plan.length === 0 ? (
                <div className="p-8 border border-slate-200 rounded-xl text-center text-sm text-slate-500">
                  No routine items yet. Click “Generate Personalized Plan” to build today’s schedule.
                </div>
              ) : (
                plan.map((item) => (
                  <div
                    key={item.id}
                    className={`p-4 rounded-xl border transition-colors ${
                      item.completed
                        ? 'bg-slate-50 border-slate-200 opacity-80'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    {editingId === item.id ? (
                      <div className="space-y-2.5">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            aria-label="Edit time slot"
                            value={editDraft.time}
                            onChange={(e) => setEditDraft({ ...editDraft, time: e.target.value })}
                            className="w-28 px-2.5 py-2 text-xs border border-slate-300 rounded-lg font-mono"
                          />
                          <input
                            type="text"
                            aria-label="Edit activity title"
                            value={editDraft.title}
                            onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
                            className="flex-1 px-2.5 py-2 text-xs border border-slate-300 rounded-lg font-semibold"
                          />
                        </div>
                        <textarea
                          rows={2}
                          aria-label="Edit recommended action"
                          value={editDraft.action}
                          onChange={(e) => setEditDraft({ ...editDraft, action: e.target.value })}
                          className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="px-3 py-1.5 min-h-[36px] text-xs text-slate-700 hover:text-slate-900"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => saveEdit(item.id)}
                            className="px-3.5 py-1.5 min-h-[36px] text-xs font-medium text-white bg-slate-900 rounded-lg"
                          >
                            Save Changes
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={item.completed}
                          onClick={() => toggleCompleted(item.id)}
                          aria-label={
                            item.completed
                              ? `Mark ${item.title} incomplete`
                              : `Mark ${item.title} completed`
                          }
                          className="p-1.5 -m-1 text-slate-600 hover:text-teal-700 shrink-0 rounded-md"
                        >
                          {item.completed ? (
                            <CheckCircle2 className="w-5 h-5 text-teal-700" aria-hidden="true" />
                          ) : (
                            <Circle className="w-5 h-5" aria-hidden="true" />
                          )}
                        </button>

                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-baseline gap-2.5">
                              <span className="font-mono tabular-nums text-xs font-semibold text-teal-800">
                                {item.time}
                              </span>
                              <h3
                                className={`text-sm font-semibold ${
                                  item.completed ? 'line-through text-slate-500' : 'text-slate-900'
                                }`}
                              >
                                {item.title}
                              </h3>
                            </div>
                            <span className="text-[11px] text-slate-500">
                              {item.priority} priority · {item.category}
                              {item.isAiGenerated ? ' · AI' : ''}
                            </span>
                          </div>

                          <p className="text-xs text-slate-700 mt-1.5 leading-relaxed">
                            {item.action}
                          </p>

                          <div className="mt-2 pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-600">
                            <div>
                              <strong className="text-slate-800">Alternative:</strong>{' '}
                              {item.alternative}
                            </div>
                            <div>
                              <strong className="text-slate-800">Why it helps:</strong>{' '}
                              {item.explanation}
                            </div>
                          </div>

                          <div className="mt-2 flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => startEdit(item)}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-900"
                            >
                              <Edit3 className="w-3 h-3" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => regenerateSingleItem(item.id)}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-900"
                            >
                              <RefreshCw className="w-3 h-3" />
                              Swap Recommendation
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <OutdoorActivityPanel
            snapshot={snapshot}
            category={category}
            prefs={prefs}
            homeProfile={homeProfile}
            sustainabilityGoals={sustainabilityGoals}
            exposureLogs={exposureLogs}
            geminiConfigured={geminiConfigured}
          />
        )}
      </div>
    </div>
  );
}
