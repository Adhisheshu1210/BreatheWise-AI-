import { useState } from 'react';
import { DailyPlanItemCard } from '../components/DailyPlanItemCard.tsx';
import { OutdoorActivityPanel } from '../components/OutdoorActivityPanel.tsx';
import { SchedulePreferencesForm } from '../components/SchedulePreferencesForm.tsx';
import { AiErrorBanner } from '../components/UiFeedback.tsx';
import { useAsyncAction } from '../hooks/useAsyncAction.ts';
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
  getSwappedPlanItem,
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
  const aiAction = useAsyncAction('Unable to generate AI plan right now.');
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
    aiAction.clearError();
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
    setSavedNotice(null);
    const res = await aiAction.run(async () => {
      const ctx = buildAiContextPayload({
        snapshot,
        prefs,
        indoorProfile: homeProfile,
        sustainabilityGoals,
        exposureLogs,
      });
      return requestStructuredAiApi<{
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
    });

    if (res) {
      onUpdatePlan(normalizeDailyPlanItems(res.items));
      setPlanMeta({
        planSummary: res.planSummary,
        dataLimitationNote: res.dataLimitationNote,
      });
      setSavedNotice('Generated personalized AI daily plan via Gemini.');
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
    onUpdatePlan(
      plan.map((item) => (item.id === id ? getSwappedPlanItem(item) : item))
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
            <SchedulePreferencesForm
              prefs={prefs}
              generating={aiAction.loading}
              hasSnapshot={Boolean(snapshot)}
              canUseGemini={geminiConfigured && !prefs.demoMode}
              onUpdatePrefs={onUpdatePrefs}
              onGenerateAi={() => void handleGenerateWithGemini(false)}
              onSaveRoutine={() => {
                onUpdatePlan(plan);
                setSavedNotice('Routine saved locally in your browser.');
              }}
              onResetPlan={handleGenerateDeterministic}
            />

            <div className="lg:col-span-8 space-y-3">
              {aiAction.error && (
                <AiErrorBanner
                  error={aiAction.error}
                  onRetry={() => void handleGenerateWithGemini(true)}
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
                  <DailyPlanItemCard
                    key={item.id}
                    item={item}
                    isEditing={editingId === item.id}
                    editDraft={editDraft}
                    onChangeDraft={setEditDraft}
                    onStartEdit={() => startEdit(item)}
                    onCancelEdit={() => setEditingId(null)}
                    onSaveEdit={() => saveEdit(item.id)}
                    onToggleCompleted={() => toggleCompleted(item.id)}
                    onSwapItem={() => regenerateSingleItem(item.id)}
                  />
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
