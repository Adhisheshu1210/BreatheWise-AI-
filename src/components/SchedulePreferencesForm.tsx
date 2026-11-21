import { Loader2, RotateCcw, Save, Sparkles } from 'lucide-react';
import type { UserPreferences } from '../types/airQuality.ts';
import { SCHEDULE_COMMUTE_MODES, SCHEDULE_EXERCISES } from '../utils/options.ts';
import { parseOptionValue } from '../utils/validation.ts';

interface SchedulePreferencesFormProps {
  prefs: UserPreferences;
  generating: boolean;
  hasSnapshot: boolean;
  canUseGemini: boolean;
  onUpdatePrefs: (next: UserPreferences) => void;
  onGenerateAi: () => void;
  onSaveRoutine: () => void;
  onResetPlan: () => void;
}

export function SchedulePreferencesForm({
  prefs,
  generating,
  hasSnapshot,
  canUseGemini,
  onUpdatePrefs,
  onGenerateAi,
  onSaveRoutine,
  onResetPlan,
}: SchedulePreferencesFormProps) {
  return (
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
                commuteMode: parseOptionValue(
                  e.target.value,
                  SCHEDULE_COMMUTE_MODES,
                  'public_transit'
                ),
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
                preferredExercise: parseOptionValue(
                  e.target.value,
                  SCHEDULE_EXERCISES,
                  'walking'
                ),
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
          onClick={onGenerateAi}
          disabled={generating || !hasSnapshot}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-50"
        >
          {generating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4 text-teal-300" />
          )}
          {canUseGemini ? 'Generate AI Plan (Gemini)' : 'Generate Personalized Plan'}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onSaveRoutine}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
          >
            <Save className="w-3.5 h-3.5" />
            Save Routine
          </button>
          <button
            type="button"
            onClick={onResetPlan}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Plan
          </button>
        </div>
      </div>
    </div>
  );
}
