import { useMemo, useState } from 'react';
import { Check, Info, Leaf, Loader2, Plus, RotateCcw, Sparkles } from 'lucide-react';
import { AiErrorBanner } from '../components/UiFeedback.tsx';
import { useAsyncAction } from '../hooks/useAsyncAction.ts';
import {
  buildAiContextPayload,
  buildDemoSustainabilityAi,
  requestStructuredAiApi,
} from '../services/apiClient.ts';
import type {
  AirQualitySnapshot,
  IndoorHomeProfile,
  SustainabilityAiResult,
  SustainabilityGoal,
  UserPreferences,
} from '../types/airQuality.ts';
import { calculateEstimatedCo2Range, calculateSustainabilityScore } from '../utils/aqi.ts';
import {
  SUSTAINABILITY_CADENCES,
  SUSTAINABILITY_CATEGORIES,
  SUSTAINABILITY_DIFFICULTIES,
} from '../utils/options.ts';
import { clampNumber, parseOptionValue, validateCustomGoalInput } from '../utils/validation.ts';

interface SustainableLivingViewProps {
  goals: SustainabilityGoal[];
  snapshot: AirQualitySnapshot | null;
  prefs: UserPreferences;
  homeProfile?: IndoorHomeProfile;
  geminiConfigured: boolean;
  onUpdateGoals: (next: SustainabilityGoal[]) => void;
  onResetGoals: () => void;
}

const IMPACT_COMPARISONS = [
  {
    title: 'Short Local Errand (~2 km)',
    currentHabit: 'Solo passenger car trip',
    alternativeHabit: 'Walking or cycling (when AQI < 150)',
    benefit: 'Estimated 0.32–0.45 kg CO₂e avoided per round-trip + zero cold-start tailpipe soot.',
    assumptions:
      'Assumes 160–225 g CO₂e/km average urban passenger car factor; cold starts emit disproportionately higher local exhaust.',
  },
  {
    title: 'Daily Office / Campus Commute (~10 km)',
    currentHabit: 'Single-occupancy car',
    alternativeHabit: 'Metro, bus, or 3-person carpool',
    benefit: 'Estimated 0.8–1.5 kg CO₂e lower per commute segment.',
    assumptions:
      'Based on typical shared transit occupancy factors (~35–95 g CO₂e/passenger-km vs solo driving).',
  },
  {
    title: 'Traffic Signals & School Pickups',
    currentHabit: 'Engine idling for 10+ minutes',
    alternativeHabit: 'Switching off engine when stopped > 30 sec',
    benefit: 'Directional reduction in localized NO₂ and black carbon near sidewalks.',
    assumptions:
      'Exact grams vary widely by engine size; directional health benefit near school gates is consistently positive.',
  },
  {
    title: 'Smog-Day Fitness Routine',
    currentHabit: 'Vigorous outdoor run when AQI > 150',
    alternativeHabit: 'Indoor cardio / mobility flow',
    benefit: 'Qualitative reduction in inhaled fine particle load during high-breathing-rate exercise.',
    assumptions:
      'Cannot calculate exact personal dose without individual ventilation rate and indoor/outdoor ratio sensors.',
  },
];

export function SustainableLivingView({
  goals,
  snapshot,
  prefs,
  homeProfile,
  geminiConfigured,
  onUpdateGoals,
  onResetGoals,
}: SustainableLivingViewProps) {
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [newTitle, setNewTitle] = useState('');
  const [newCat, setNewCat] = useState<SustainabilityGoal['category']>('transportation');
  const [newDifficulty, setNewDifficulty] = useState<SustainabilityGoal['difficulty']>('easy');
  const [newCadence, setNewCadence] = useState<SustainabilityGoal['cadence']>('weekly');
  const [newTarget, setNewTarget] = useState(3);
  const [formError, setFormError] = useState<string | null>(null);
  const [aiPlan, setAiPlan] = useState<SustainabilityAiResult | null>(null);
  const aiAction = useAsyncAction('Unable to personalize sustainability guidance right now.');

  const summary = useMemo(() => calculateSustainabilityScore(goals), [goals]);
  const { totalCo2Min, totalCo2Max } = useMemo(
    () => calculateEstimatedCo2Range(goals),
    [goals]
  );

  const filteredGoals = useMemo(
    () => (categoryFilter === 'all' ? goals : goals.filter((g) => g.category === categoryFilter)),
    [goals, categoryFilter]
  );

  const incrementGoal = (id: string) => {
    onUpdateGoals(
      goals.map((g) =>
        g.id === id ? { ...g, completedCount: Math.min(g.targetCount * 2, g.completedCount + 1) } : g
      )
    );
  };

  const handleAddGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateCustomGoalInput({ title: newTitle, targetCount: newTarget });
    if (!check.valid || !check.value) {
      setFormError(check.error ?? 'Please enter a valid goal.');
      return;
    }
    setFormError(null);
    const pts = newDifficulty === 'easy' ? 15 : newDifficulty === 'moderate' ? 25 : 40;
    const newGoal: SustainabilityGoal = {
      id: `goal-${Date.now()}`,
      title: check.value.title,
      category: newCat,
      difficulty: newDifficulty,
      cadence: newCadence,
      targetCount: check.value.targetCount,
      completedCount: 0,
      pointsPerAction: pts,
      estimatedCo2RangeKg: [0.05, 0.25],
      methodologyNote: 'Qualitative/illustrative range based on habit category; track consistency first.',
    };
    onUpdateGoals([newGoal, ...goals]);
    setNewTitle('');
  };

  const handleGenerateHabitPlan = async (forceRefresh = false) => {
    aiAction.clearError();
    if (prefs.demoMode || !geminiConfigured || !snapshot) {
      setAiPlan(
        buildDemoSustainabilityAi({
          goals,
          snapshot,
          standard: prefs.aqiStandard,
        })
      );
      return;
    }

    const res = await aiAction.run(async () => {
      const ctx = buildAiContextPayload({
        snapshot,
        prefs,
        indoorProfile: homeProfile,
        sustainabilityGoals: goals,
      });
      return requestStructuredAiApi<SustainabilityAiResult>({
        taskType: 'sustainability-plan',
        context: ctx,
        payload: {
          score: summary.score,
          completedTotal: summary.completedTotal,
          targetTotal: summary.targetTotal,
          estimatedCo2AvoidedKgRange: [totalCo2Min, totalCo2Max],
          goals: goals.slice(0, 8).map((g) => ({
            title: g.title,
            category: g.category,
            progress: `${g.completedCount}/${g.targetCount}`,
            cadence: g.cadence,
          })),
        },
        forceRefresh,
      });
    });

    if (res) {
      setAiPlan({ ...res, isAiGenerated: true });
    }
  };

  return (
    <div className="space-y-6">
      {/* Your Actions This Week Dashboard */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Sustainable Living & Impact of My Choices
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Turn everyday mobility, cooking, and energy habits into transparent clean-air actions.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
            <button
              type="button"
              onClick={() => handleGenerateHabitPlan(false)}
              disabled={aiAction.loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-50"
            >
              {aiAction.loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-teal-300" />
              )}
              {geminiConfigured && !prefs.demoMode && snapshot
                ? 'Personalize Habit Plan (Gemini)'
                : 'Generate Habit Plan (Demo)'}
            </button>
            <button
              type="button"
              onClick={onResetGoals}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Goals
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-[#0F172A] text-white">
            <div className="text-xs text-slate-300">Sustainable Action Score</div>
            <div className="font-mono tabular-nums text-3xl font-bold mt-1">
              {summary.score} <span className="text-sm font-normal text-teal-300">pts</span>
            </div>
            <div className="text-[11px] text-slate-300 mt-1">
              Transparent rule: 15–40 pts per logged habit completion
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-xs text-slate-600">Actions Logged This Cycle</div>
            <div className="font-mono tabular-nums text-3xl font-bold text-slate-900 mt-1">
              {summary.completedTotal}{' '}
              <span className="text-sm font-normal text-slate-500">/ {summary.targetTotal} target</span>
            </div>
            <div
              className="mt-2 h-1.5 bg-slate-200 rounded-full overflow-hidden"
              role="progressbar"
              aria-label="Weekly sustainability target completion"
              aria-valuemin={0}
              aria-valuemax={Math.max(1, summary.targetTotal)}
              aria-valuenow={summary.completedTotal}
            >
              <div
                className="h-full bg-teal-600"
                style={{
                  width: `${Math.min(
                    100,
                    summary.targetTotal > 0
                      ? Math.round((summary.completedTotal / summary.targetTotal) * 100)
                      : 0
                  )}%`,
                }}
              />
            </div>
          </div>

          <div className="p-4 rounded-xl bg-teal-50 border border-teal-200">
            <div className="text-xs text-teal-900 font-medium">
              Estimated CO₂e Range Avoided
            </div>
            <div className="font-mono tabular-nums text-2xl font-bold text-teal-950 mt-1">
              {totalCo2Min} – {totalCo2Max} <span className="text-sm font-normal">kg</span>
            </div>
            <div className="text-[11px] text-teal-800 mt-1">
              Approximate directional estimate using transparent factor ranges
            </div>
          </div>
        </div>

        {aiAction.error && (
          <AiErrorBanner
            error={aiAction.error}
            onRetry={() => handleGenerateHabitPlan(true)}
            className="mt-4"
          />
        )}

        {aiPlan && (
          <div className="mt-4 p-4 rounded-xl border border-teal-200 bg-teal-50/40 space-y-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-slate-900">Personalized Weekly Habit Focus</strong>
              <span className="text-[11px] text-slate-500">
                {aiPlan.isDemoMock ? 'Demo simulation' : 'Gemini tailored'}
              </span>
            </div>
            <p className="font-medium text-slate-900">{aiPlan.weeklyFocus}</p>
            <p className="text-slate-700">{aiPlan.impactSummary}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {aiPlan.priorityActions.map((act, idx) => (
                <div key={idx} className="p-3 rounded-lg bg-white border border-slate-200 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">{act.title}</span>
                    <span className="text-[11px] text-teal-800 shrink-0">{act.cadence}</span>
                  </div>
                  <p className="text-slate-700">{act.practicalStep}</p>
                  <p className="text-[11px] text-slate-500">{act.whyItMatters}</p>
                </div>
              ))}
            </div>
            {aiPlan.habitSynergies.length > 0 && (
              <div className="text-[11px] text-slate-700">
                <strong>Habit synergies:</strong> {aiPlan.habitSynergies.join(' · ')}
              </div>
            )}
            <p className="text-[11px] text-slate-500">{aiPlan.dataLimitationNote}</p>
          </div>
        )}
      </section>

      {/* Goals + Add custom */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Your Sustainability Targets</h2>
          <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-lg" role="group" aria-label="Filter goals by category">
            {['all', 'transportation', 'energy', 'cooking', 'waste', 'outdoor'].map((cat) => (
              <button
                key={cat}
                type="button"
                aria-pressed={categoryFilter === cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize ${
                  categoryFilter === cat
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <form
          onSubmit={handleAddGoal}
          className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
        >
          <div className="sm:col-span-5">
            <label htmlFor="goal-title" className="block text-[11px] font-medium text-slate-700 mb-1">
              Create Custom Goal
            </label>
            <input
              id="goal-title"
              type="text"
              aria-invalid={Boolean(formError)}
              aria-describedby={formError ? 'goal-form-error' : undefined}
              value={newTitle}
              onChange={(e) => {
                setNewTitle(e.target.value);
                if (formError) setFormError(null);
              }}
              placeholder="e.g., Air-dry laundry instead of electric dryer"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="goal-category" className="block text-[11px] font-medium text-slate-700 mb-1">
              Category
            </label>
            <select
              id="goal-category"
              value={newCat}
              onChange={(e) =>
                setNewCat(parseOptionValue(e.target.value, SUSTAINABILITY_CATEGORIES, newCat))
              }
              className="w-full px-2 py-2 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="transportation">Transport</option>
              <option value="energy">Energy</option>
              <option value="cooking">Cooking</option>
              <option value="waste">Waste</option>
              <option value="shopping">Shopping</option>
              <option value="water">Water</option>
              <option value="outdoor">Outdoor</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="goal-difficulty" className="block text-[11px] font-medium text-slate-700 mb-1">
              Difficulty
            </label>
            <select
              id="goal-difficulty"
              value={newDifficulty}
              onChange={(e) =>
                setNewDifficulty(
                  parseOptionValue(e.target.value, SUSTAINABILITY_DIFFICULTIES, newDifficulty)
                )
              }
              className="w-full px-2 py-2 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="easy">Easy (+15 pts)</option>
              <option value="moderate">Moderate (+25 pts)</option>
              <option value="committed">Committed (+40 pts)</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="goal-cadence" className="block text-[11px] font-medium text-slate-700 mb-1">
              Cadence
            </label>
            <select
              id="goal-cadence"
              value={newCadence}
              onChange={(e) =>
                setNewCadence(
                  parseOptionValue(e.target.value, SUSTAINABILITY_CADENCES, newCadence)
                )
              }
              className="w-full px-2 py-2 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="weekly">Weekly</option>
              <option value="daily">Daily</option>
            </select>
          </div>
          <div className="sm:col-span-1">
            <label htmlFor="goal-target" className="block text-[11px] font-medium text-slate-700 mb-1">
              Target
            </label>
            <input
              id="goal-target"
              type="number"
              min={1}
              max={14}
              value={newTarget}
              onChange={(e) => setNewTarget(clampNumber(Number(e.target.value), 1, 30, 1))}
              className="w-full px-2 py-2 text-xs border border-slate-300 rounded-lg bg-white font-mono"
            />
          </div>
          <div className="sm:col-span-12 flex flex-wrap items-center justify-between gap-2 pt-1">
            {formError ? (
              <p id="goal-form-error" className="text-xs text-red-700" role="alert">
                {formError}
              </p>
            ) : (
              <span className="text-[11px] text-slate-600">
                Choose difficulty and cadence to add a trackable action target.
              </span>
            )}
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Goal
            </button>
          </div>
        </form>

        <div className="mt-4 divide-y divide-slate-100">
          {filteredGoals.map((goal) => {
            const pct = Math.min(100, Math.round((goal.completedCount / goal.targetCount) * 100));
            return (
              <div key={goal.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <Leaf className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                    <span className="text-sm font-semibold text-slate-900">{goal.title}</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {goal.category} · {goal.difficulty} · {goal.cadence} · +{goal.pointsPerAction} pts/action
                  </p>
                  <p className="text-[11px] text-slate-500">{goal.methodologyNote}</p>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <div className="font-mono tabular-nums text-xs font-semibold text-slate-900">
                      {goal.completedCount} / {goal.targetCount}
                    </div>
                    <div
                      className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1"
                      role="progressbar"
                      aria-label={`${goal.title} progress`}
                      aria-valuemin={0}
                      aria-valuemax={goal.targetCount}
                      aria-valuenow={goal.completedCount}
                    >
                      <div className="h-full bg-teal-600" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => incrementGoal(goal.id)}
                    className="inline-flex items-center gap-1 px-3 py-2 min-h-[38px] text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg whitespace-nowrap"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Log Action
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Impact of My Choices */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6">
        <div className="pb-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Impact of My Choices</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Side-by-side comparison of habits, estimated benefits, and explicit calculation
            assumptions.
          </p>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {IMPACT_COMPARISONS.map((c) => (
            <div key={c.title} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">{c.title}</h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                  <span className="text-[11px] text-slate-500 block">Current Habit</span>
                  <span className="font-medium text-slate-800">{c.currentHabit}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-teal-50 border border-teal-200">
                  <span className="text-[11px] text-teal-800 block">Cleaner Alternative</span>
                  <span className="font-medium text-teal-950">{c.alternativeHabit}</span>
                </div>
              </div>
              <p className="text-xs text-slate-800 font-medium">{c.benefit}</p>
              <p className="text-[11px] text-slate-500 flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{c.assumptions}</span>
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
