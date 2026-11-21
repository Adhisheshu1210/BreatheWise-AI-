import { useState } from 'react';
import {
  Loader2,
  Plus,
  Shield,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { AiErrorBanner, ChecklistToggleRow } from '../components/UiFeedback.tsx';
import { useAsyncAction } from '../hooks/useAsyncAction.ts';
import { useLocalStorage } from '../hooks/useLocalStorage.ts';
import {
  buildAiContextPayload,
  buildDemoFamilyPlan,
  requestStructuredAiApi,
} from '../services/apiClient.ts';
import type {
  AirQualitySnapshot,
  FamilyAiResult,
  HouseholdGroupId,
  HouseholdMemberProfile,
  IndoorHomeProfile,
  SustainabilityGoal,
  UserPreferences,
} from '../types/airQuality.ts';
import { getActiveAqiValue, getAqiCategory } from '../utils/aqi.ts';
import { HOUSEHOLD_GROUP_IDS } from '../utils/options.ts';
import { parseOptionValue } from '../utils/validation.ts';

interface FamilyProtectionViewProps {
  snapshot: AirQualitySnapshot | null;
  prefs: UserPreferences;
  homeProfile?: IndoorHomeProfile;
  sustainabilityGoals?: SustainabilityGoal[];
  geminiConfigured: boolean;
  onUpdatePrefs: (next: UserPreferences) => void;
}

const HOUSEHOLD_GROUPS: Array<{
  id: HouseholdGroupId;
  label: string;
  defaultPrecaution: string;
  indoorAlt: string;
}> = [
  {
    id: 'children',
    label: 'Children',
    defaultPrecaution:
      'Modify vigorous outdoor play when AQI exceeds 100; choose quieter interior streets for school travel.',
    indoorAlt: 'Indoor creative games, reading corners, and movement breaks away from kitchen fumes.',
  },
  {
    id: 'older_adults',
    label: 'Older Adults',
    defaultPrecaution:
      'Plan essential errands during midday lower-pollution windows and rest in cleaner indoor air.',
    indoorAlt: 'Gentle indoor hallway walking, seated stretching, and hydration.',
  },
  {
    id: 'respiratory_sensitive',
    label: 'Asthma / Respiratory Sensitivity',
    defaultPrecaution:
      'Follow your personal clinician’s action plan, keep prescribed relief inhalers accessible, and limit exposure above AQI 100.',
    indoorAlt: 'Low-dust bedroom environment with windows sealed during spikes.',
  },
  {
    id: 'outdoor_workers',
    label: 'Outdoor Workers',
    defaultPrecaution:
      'Take scheduled breaks in enclosed cleaner indoor spaces and discuss well-fitted N95/FFP2 respirator use during elevated episodes.',
    indoorAlt: 'Move administrative or prep tasks indoors whenever possible during peak smog hours.',
  },
  {
    id: 'adults',
    label: 'Adults',
    defaultPrecaution:
      'Shift intense outdoor cardio indoors when AQI enters Poor/Severe ranges and choose lower-traffic routes.',
    indoorAlt: 'Home bodyweight strength, yoga, or indoor treadmill/stationary bike.',
  },
  {
    id: 'pets',
    label: 'Pets',
    defaultPrecaution:
      'Keep walks brief during heavy smog, wipe paws gently after outdoor relief breaks, and avoid dusty roadside edges.',
    indoorAlt: 'Indoor scent games, puzzle feeders, and gentle tug play.',
  },
];

const DEFAULT_HOUSEHOLD_DISPLAY: HouseholdMemberProfile[] = [
  { id: 'default-1', group: 'adults', nickname: 'Adults' },
  { id: 'default-2', group: 'children', nickname: 'Children (Example)' },
];

export function FamilyProtectionView({
  snapshot,
  prefs,
  homeProfile,
  sustainabilityGoals,
  geminiConfigured,
  onUpdatePrefs,
}: FamilyProtectionViewProps) {
  const [newGroup, setNewGroup] = useState<HouseholdGroupId>('children');
  const [newLabel, setNewLabel] = useState('');
  const [checkedItems, setCheckedItems] = useLocalStorage<Record<string, boolean>>(
    'bw_family_checks_v1',
    {}
  );
  const [aiPlan, setAiPlan] = useState<FamilyAiResult | null>(null);
  const aiAction = useAsyncAction('Could not generate AI family plan.');

  const activeAqi = snapshot ? getActiveAqiValue(snapshot, prefs.aqiStandard) : null;
  const cat = getAqiCategory(activeAqi, prefs.aqiStandard);
  const isElevated = cat.id !== 'good';

  const addMember = (e: React.FormEvent) => {
    e.preventDefault();
    const meta = HOUSEHOLD_GROUPS.find((g) => g.id === newGroup) ?? HOUSEHOLD_GROUPS[0];
    const member: HouseholdMemberProfile = {
      id: `member-${Date.now()}`,
      group: newGroup,
      nickname: newLabel.trim() || meta.label,
    };
    onUpdatePrefs({
      ...prefs,
      household: [...prefs.household, member],
    });
    setNewLabel('');
  };

  const removeMember = (id: string) => {
    onUpdatePrefs({
      ...prefs,
      household: prefs.household.filter((m) => m.id !== id),
    });
  };

  const toggleCheck = (key: string) => {
    setCheckedItems((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const activeGroups =
    prefs.household.length > 0 ? prefs.household : DEFAULT_HOUSEHOLD_DISPLAY;

  const handleGenerateFamilyAi = async (forceRefresh = false) => {
    if (!snapshot) return;
    aiAction.clearError();

    if (prefs.demoMode || !geminiConfigured) {
      setAiPlan(
        buildDemoFamilyPlan({
          snapshot,
          standard: prefs.aqiStandard,
          groups: activeGroups.map(
            (m) => HOUSEHOLD_GROUPS.find((g) => g.id === m.group) ?? HOUSEHOLD_GROUPS[0]
          ),
        })
      );
      return;
    }

    const res = await aiAction.run(async () => {
      const ctx = buildAiContextPayload({
        snapshot,
        prefs,
        indoorProfile: homeProfile,
        sustainabilityGoals,
      });
      return requestStructuredAiApi<FamilyAiResult>({
        taskType: 'family-protection',
        context: ctx,
        payload: {
          members:
            prefs.household.length > 0
              ? prefs.household.map((m) => ({ group: m.group, label: m.nickname }))
              : [{ group: 'adults', label: 'General Household' }],
        },
        forceRefresh,
      });
    });

    if (res) {
      setAiPlan(res);
    }
  };

  const morningList = aiPlan?.morningChecklist ?? [
    `Check ${snapshot?.location.name ?? 'local'} AQI before morning school or work departures.`,
    isElevated
      ? 'Keep exterior windows closed during early morning smog accumulation.'
      : 'Allow brief 15-minute morning ventilation if traffic outside is light.',
    'Pack well-fitted N95/FFP2 masks for essential outdoor commutes when AQI exceeds 150.',
  ];

  const eveningList = aiPlan?.eveningChecklist ?? [
    'Use kitchen exhaust fan while preparing dinner and keep bedroom doors closed.',
    'Wipe entryway shoes and damp-clean dusty hard surfaces rather than dry sweeping.',
    'Prepare a low-particle sleeping space 45 minutes before bedtime.',
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Protect My Family</h1>
            <p className="text-xs text-slate-500 mt-1">
              Optional household profiles for calm, non-diagnostic pollution precautions.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleGenerateFamilyAi(false)}
            disabled={aiAction.loading || !snapshot}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-50 whitespace-nowrap"
          >
            {aiAction.loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 text-teal-300" />
            )}
            {geminiConfigured && !prefs.demoMode
              ? 'Tailor Family Plan with Gemini'
              : 'Refresh Household Plan (Demo)'}
          </button>
        </div>

        <div className="mt-4 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-2.5">
          <Shield className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
          <p>
            <strong>Privacy & Medical Notice:</strong> Household groups are completely optional and
            stored only in your browser. BreatheWise provides environmental exposure guidance—it does
            not diagnose conditions or replace personal medical advice.
          </p>
        </div>

        {aiAction.error && (
          <AiErrorBanner
            error={aiAction.error}
            onRetry={() => handleGenerateFamilyAi(true)}
            className="mt-3"
          />
        )}

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Household Builder */}
          <div className="lg:col-span-4 space-y-4">
            <form
              onSubmit={addMember}
              className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3"
            >
              <h2 className="text-sm font-semibold text-slate-900">Add Household Member (Optional)</h2>
              <div>
                <label htmlFor="family-group-select" className="block text-xs font-medium text-slate-700 mb-1">
                  Group
                </label>
                <select
                  id="family-group-select"
                  value={newGroup}
                  onChange={(e) =>
                    setNewGroup(parseOptionValue(e.target.value, HOUSEHOLD_GROUP_IDS, newGroup))
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  {HOUSEHOLD_GROUPS.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="family-member-label" className="block text-xs font-medium text-slate-700 mb-1">
                  Display Label (Optional, non-sensitive)
                </label>
                <input
                  id="family-member-label"
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="e.g., School-age child, Grandma"
                  maxLength={40}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                />
              </div>
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" />
                Add to Household
              </button>
            </form>

            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
              <div className="px-4 py-2.5 bg-slate-50 text-xs font-semibold text-slate-700">
                Configured Household ({prefs.household.length})
              </div>
              {prefs.household.length === 0 ? (
                <p className="p-4 text-xs text-slate-500">
                  No profiles added yet. Showing standard adult & child guidance on the right.
                </p>
              ) : (
                prefs.household.map((m) => (
                  <div key={m.id} className="px-4 py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-slate-900">{m.nickname}</div>
                      <div className="text-[11px] text-slate-500">
                        {HOUSEHOLD_GROUPS.find((g) => g.id === m.group)?.label}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeMember(m.id)}
                      aria-label={`Remove ${m.nickname}`}
                      className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-md"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Family Precautions & Checklists */}
          <div className="lg:col-span-8 space-y-5">
            {aiPlan && (
              <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 text-xs text-teal-950 space-y-1.5">
                <div>
                  <strong className="font-semibold">Household Summary:</strong> {aiPlan.overview}
                </div>
                {aiPlan.dataLimitationNote && (
                  <p className="text-[11px] text-teal-900/80">
                    <strong>Context note:</strong> {aiPlan.dataLimitationNote}
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeGroups.map((member) => {
                const groupMeta =
                  HOUSEHOLD_GROUPS.find((g) => g.id === member.group) ?? HOUSEHOLD_GROUPS[0];
                const aiMatch = aiPlan?.groupAdvice?.find((a) =>
                  a.group.toLowerCase().includes(groupMeta.label.toLowerCase().split(' ')[0])
                );
                return (
                  <div
                    key={member.id}
                    className="p-4 rounded-xl border border-slate-200 bg-white space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-slate-900">{member.nickname}</h3>
                      <span className="text-[11px] text-slate-500">{cat.shortLabel}</span>
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed">
                      {aiMatch?.precaution ?? groupMeta.defaultPrecaution}
                    </p>
                    <p className="text-[11px] text-slate-600 pt-2 border-t border-slate-100">
                      <strong>Indoor option:</strong>{' '}
                      {aiMatch?.indoorAlternative ?? groupMeta.indoorAlt}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                School Commute Consideration
              </h3>
              <p className="text-xs text-slate-700 mt-1.5 leading-relaxed">
                {aiPlan?.schoolCommuteGuidance ??
                  (isElevated
                    ? 'When morning AQI is elevated, prefer enclosed transit or carpools over walking beside busy intersections, and ask school staff about indoor recess options.'
                    : 'Current morning levels support normal school walks; choose shaded interior streets away from bus idling zones.')}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { title: 'Morning Protection Checklist', prefix: 'am', list: morningList },
                { title: 'Evening Protection Checklist', prefix: 'pm', list: eveningList },
              ].map((section) => (
                <div
                  key={section.prefix}
                  className="p-4 rounded-xl border border-slate-200 bg-white space-y-2.5"
                >
                  <h3 className="text-sm font-semibold text-slate-900">{section.title}</h3>
                  <ul className="space-y-2">
                    {section.list.map((item, idx) => {
                      const key = `${section.prefix}-${idx}`;
                      return (
                        <li key={key}>
                          <ChecklistToggleRow
                            checked={Boolean(checkedItems[key])}
                            label={item}
                            onToggle={() => toggleCheck(key)}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
