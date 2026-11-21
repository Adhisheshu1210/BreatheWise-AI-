import { useEffect, useState } from 'react';
import { Info, Loader2, Sparkles } from 'lucide-react';
import { IndoorHomeProfileForm } from '../components/IndoorHomeProfileForm.tsx';
import { AiErrorBanner, ChecklistToggleRow } from '../components/UiFeedback.tsx';
import { useAsyncAction } from '../hooks/useAsyncAction.ts';
import { useLocalStorage } from '../hooks/useLocalStorage.ts';
import {
  buildAiContextPayload,
  buildDemoBudgetUpgradeAi,
  buildDemoIndoorCarePlan,
  requestStructuredAiApi,
} from '../services/apiClient.ts';
import type {
  AirQualitySnapshot,
  BudgetHomeUpgradeAiResult,
  IndoorCarePlan,
  IndoorHomeProfile,
  SustainabilityGoal,
  UserPreferences,
} from '../types/airQuality.ts';

interface IndoorAirCareViewProps {
  snapshot: AirQualitySnapshot | null;
  prefs: UserPreferences;
  homeProfile: IndoorHomeProfile;
  sustainabilityGoals?: SustainabilityGoal[];
  geminiConfigured: boolean;
  onUpdateHomeProfile: (next: IndoorHomeProfile) => void;
}

export function IndoorAirCareView({
  snapshot,
  prefs,
  homeProfile,
  sustainabilityGoals,
  geminiConfigured,
  onUpdateHomeProfile,
}: IndoorAirCareViewProps) {
  const [plan, setPlan] = useState<IndoorCarePlan | null>(() =>
    snapshot ? buildDemoIndoorCarePlan(homeProfile, snapshot) : null
  );
  const [isAiResult, setIsAiResult] = useState(false);
  const planAction = useAsyncAction('Unable to generate Gemini indoor air plan.');
  const [upgradePlan, setUpgradePlan] = useState<BudgetHomeUpgradeAiResult | null>(null);
  const upgradeAction = useAsyncAction('Unable to tailor budget upgrades right now.');
  const [checklistTab, setChecklistTab] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [checkedMap, setCheckedMap] = useLocalStorage<Record<string, boolean>>(
    'bw_indoor_checks_v1',
    {}
  );

  useEffect(() => {
    if (snapshot && !isAiResult) {
      setPlan(buildDemoIndoorCarePlan(homeProfile, snapshot));
    }
  }, [snapshot?.location.id, snapshot?.currentUsAqi, homeProfile, isAiResult]);

  const generatePlan = async (useDemoFallback = false, forceRefresh = false) => {
    if (!snapshot) return;
    if (useDemoFallback || prefs.demoMode || !geminiConfigured) {
      setPlan(buildDemoIndoorCarePlan(homeProfile, snapshot));
      setIsAiResult(false);
      planAction.clearError();
      return;
    }

    const res = await planAction.run(async () => {
      const ctx = buildAiContextPayload({
        snapshot,
        prefs,
        indoorProfile: homeProfile,
        sustainabilityGoals,
      });
      return requestStructuredAiApi<IndoorCarePlan>({
        taskType: 'indoor-care',
        context: ctx,
        payload: { ...homeProfile },
        forceRefresh,
      });
    });

    if (res) {
      setPlan({
        ...res,
        disclaimer:
          res.disclaimer ||
          'AI-assisted indoor plan. Indoor care reduces particle buildup but cannot guarantee total elimination of pollution.',
      });
      setIsAiResult(true);
    }
  };

  const generateBudgetUpgrades = async (forceRefresh = false) => {
    if (!snapshot) return;
    upgradeAction.clearError();

    if (prefs.demoMode || !geminiConfigured) {
      setUpgradePlan(buildDemoBudgetUpgradeAi({ profile: homeProfile, snapshot }));
      return;
    }

    const res = await upgradeAction.run(async () => {
      const ctx = buildAiContextPayload({
        snapshot,
        prefs,
        indoorProfile: homeProfile,
        sustainabilityGoals,
      });
      return requestStructuredAiApi<BudgetHomeUpgradeAiResult>({
        taskType: 'budget-home-upgrade',
        context: ctx,
        payload: { ...homeProfile },
        forceRefresh,
      });
    });

    if (res) {
      setUpgradePlan({ ...res, isAiGenerated: true });
    }
  };

  const activeChecklist = plan?.checklists?.[checklistTab] ?? [];

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h1 className="text-xl font-bold text-slate-900">AI Indoor Air Care Assistant</h1>
            <p className="text-xs text-slate-500 mt-1">
              Room-by-room cleaner air planning and budget-matched steps tailored to your home and
              current outdoor conditions.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void generatePlan(false, false)}
            disabled={planAction.loading || !snapshot}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-50 whitespace-nowrap"
          >
            {planAction.loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 text-teal-300" />
            )}
            {geminiConfigured && !prefs.demoMode
              ? 'Generate AI Home Plan (Gemini)'
              : 'Update Home Air Plan'}
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <IndoorHomeProfileForm
            homeProfile={homeProfile}
            onUpdateHomeProfile={onUpdateHomeProfile}
          />

          <div className="lg:col-span-8 space-y-5">
            {planAction.error && (
              <AiErrorBanner
                error={planAction.error}
                onRetry={() => void generatePlan(false, true)}
                secondaryLabel="Load Offline Plan"
                onSecondaryAction={() => void generatePlan(true)}
              />
            )}

            {plan && (
              <>
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-900">
                      {isAiResult ? 'Gemini AI-Generated Home Strategy' : 'Evidence-Supported Sample Plan'}
                    </span>
                    <span className="text-slate-500">
                      {isAiResult ? 'AI-generated suggestion' : 'Standard indoor hygiene baseline'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">{plan.summary}</p>
                  <div className="pt-2 border-t border-slate-200/80 text-xs text-slate-900">
                    <strong>Ventilation Decision:</strong> {plan.ventilationVerdict}
                  </div>
                </div>

                <div>
                  <h2 className="text-sm font-semibold text-slate-900 mb-3">
                    Room-by-Room Cleaner Air Plan
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {plan.rooms.map((r) => (
                      <div key={r.room} className="p-3.5 rounded-xl border border-slate-200 bg-white">
                        <div className="text-xs font-bold text-slate-900">{r.room}</div>
                        <div className="text-xs font-medium text-teal-800 mt-1">
                          {r.priorityAction}
                        </div>
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">{r.details}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-white">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                    <h2 className="text-sm font-semibold text-slate-900">
                      Home Improvement Checklist
                    </h2>
                    <div
                      className="inline-flex p-1 bg-slate-100 rounded-lg"
                      role="group"
                      aria-label="Checklist frequency"
                    >
                      {(['daily', 'weekly', 'monthly'] as const).map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          aria-pressed={checklistTab === tab}
                          onClick={() => setChecklistTab(tab)}
                          className={`px-3 py-1 text-xs font-medium rounded-md capitalize ${
                            checklistTab === tab
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-600'
                          }`}
                        >
                          {tab}
                        </button>
                      ))}
                    </div>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {activeChecklist.map((item, idx) => {
                      const key = `${checklistTab}-${idx}`;
                      const done = Boolean(checkedMap[key]);
                      return (
                        <li key={key}>
                          <ChecklistToggleRow
                            checked={done}
                            label={item}
                            onToggle={() => setCheckedMap((p) => ({ ...p, [key]: !done }))}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-slate-900">
                      Budget-Based Clean Air Options
                    </h2>
                    <button
                      type="button"
                      onClick={() => void generateBudgetUpgrades(false)}
                      disabled={upgradeAction.loading || !snapshot}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-900 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-lg disabled:opacity-50 self-start sm:self-auto"
                    >
                      {upgradeAction.loading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 text-teal-700" />
                      )}
                      {geminiConfigured && !prefs.demoMode
                        ? 'Tailor Upgrades to My ₹ Budget (Gemini)'
                        : 'Tailor Budget Upgrades (Demo)'}
                    </button>
                  </div>

                  {upgradeAction.error && (
                    <AiErrorBanner
                      error={upgradeAction.error}
                      retryLabel="Retry"
                      onRetry={() => void generateBudgetUpgrades(true)}
                    />
                  )}

                  {upgradePlan && (
                    <div className="p-4 rounded-xl border border-teal-200 bg-teal-50/40 space-y-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <strong className="text-slate-900">
                          Prioritized Strategy ({upgradePlan.budgetLabel})
                        </strong>
                        <span className="text-[11px] text-slate-500">
                          {upgradePlan.isDemoMock ? 'Demo simulation' : 'Gemini tailored'}
                        </span>
                      </div>
                      <p className="text-slate-700">{upgradePlan.strategySummary}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {upgradePlan.prioritizedUpgrades.map((u, idx) => (
                          <div key={idx} className="p-3 rounded-lg bg-white border border-slate-200 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-slate-900">{u.item}</span>
                              <span className="font-mono text-[11px] text-teal-800 shrink-0">
                                {u.approxCostRange}
                              </span>
                            </div>
                            <p className="text-slate-600">{u.reasonForThisHome}</p>
                            <p className="text-[11px] text-slate-500">
                              <strong>Benefit:</strong> {u.expectedBenefit} ·{' '}
                              <strong>Limit:</strong> {u.limitation}
                            </p>
                          </div>
                        ))}
                      </div>
                      {upgradePlan.skipForNow.length > 0 && (
                        <div className="text-[11px] text-slate-700">
                          <strong>Skip for now:</strong> {upgradePlan.skipForNow.join(' · ')}
                        </div>
                      )}
                      <p className="text-[11px] text-slate-500">{upgradePlan.dataLimitationNote}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {plan.budgetRecommendations.map((b) => {
                      const tierMatch =
                        (homeProfile.budgetTier === '0' && b.tier.includes('₹0')) ||
                        (homeProfile.budgetTier === '500' && b.tier.includes('500')) ||
                        (homeProfile.budgetTier === '2000' && b.tier.includes('2,000')) ||
                        (homeProfile.budgetTier === '5000' && b.tier.includes('5,000')) ||
                        (homeProfile.budgetTier === '5000+' && b.tier.includes('Higher'));
                      return (
                        <div
                          key={b.tier}
                          className={`p-3.5 rounded-xl border ${
                            tierMatch
                              ? 'border-teal-500 bg-teal-50/50'
                              : 'border-slate-200 bg-slate-50/70'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-900">{b.tier}</span>
                            {tierMatch && (
                              <span className="text-[11px] font-medium text-teal-800">
                                Selected tier
                              </span>
                            )}
                          </div>
                          <ul className="mt-2 space-y-1 text-xs text-slate-700 list-disc list-inside">
                            {b.items.map((txt, i) => (
                              <li key={i}>{txt}</li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-start gap-2 text-[11px] text-slate-500 pt-2">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{plan.disclaimer}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
