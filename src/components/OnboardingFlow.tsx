import { useState } from 'react';
import { ArrowRight, Check, MapPin, Search, Shield, Sparkles } from 'lucide-react';
import { DEMO_SCENARIOS } from '../data/demoData.ts';
import { searchLocationsApi } from '../services/apiClient.ts';
import type {
  LifestyleRole,
  LocationResult,
  UserPreferences,
} from '../types/airQuality.ts';

interface OnboardingFlowProps {
  initialPrefs: UserPreferences;
  onComplete: (params: {
    prefs: UserPreferences;
    selectedLocation?: LocationResult;
    demoKey?: string;
  }) => void;
  onSkip: () => void;
}

const PRIORITY_OPTIONS = [
  'Protect my family',
  'Plan outdoor activities',
  'Improve home air',
  'Reduce pollution exposure',
  'Live more sustainably',
];

const ROLE_OPTIONS: Array<{ id: LifestyleRole; label: string; desc: string }> = [
  { id: 'parent', label: 'Parent / Caregiver', desc: 'School commutes & children’s play' },
  { id: 'office_worker', label: 'Office Worker', desc: 'Peak commute & indoor desk air' },
  { id: 'student', label: 'Student', desc: 'Campus transit & outdoor sports' },
  { id: 'outdoor_worker', label: 'Outdoor Worker', desc: 'Extended outdoor shift protection' },
  { id: 'senior', label: 'Senior Citizen', desc: 'Gentle pacing & clean-air windows' },
  { id: 'general', label: 'General User', desc: 'Balanced everyday air intelligence' },
];

export function OnboardingFlow({
  initialPrefs,
  onComplete,
  onSkip,
}: OnboardingFlowProps) {
  const [step, setStep] = useState(1);
  const [cityQuery, setCityQuery] = useState('');
  const [cityResults, setCityResults] = useState<LocationResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<LocationResult | undefined>(undefined);
  const [selectedDemoKey, setSelectedDemoKey] = useState<string | undefined>('demo-delhi');

  const [priorities, setPriorities] = useState<string[]>(initialPrefs.priorities);
  const [role, setRole] = useState<LifestyleRole>(initialPrefs.lifestyleRole);
  const [schedule, setSchedule] = useState(initialPrefs.schedule);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cityQuery.trim().length < 2) return;
    setSearching(true);
    setSearchErr(null);
    try {
      const list = await searchLocationsApi(cityQuery.trim());
      setCityResults(list);
      if (list.length === 0) setSearchErr('No matching cities found. Try another spelling.');
    } catch (err) {
      setSearchErr(err instanceof Error ? err.message : 'Search failed.');
    } finally {
      setSearching(false);
    }
  };

  const togglePriority = (p: string) => {
    setPriorities((prev) =>
      prev.includes(p) ? prev.filter((item) => item !== p) : [...prev, p]
    );
  };

  const finishSetup = () => {
    onComplete({
      prefs: {
        ...initialPrefs,
        onboardingCompleted: true,
        priorities: priorities.length > 0 ? priorities : ['Protect my family'],
        lifestyleRole: role,
        schedule,
        demoMode: !selectedCity,
      },
      selectedLocation: selectedCity,
      demoKey: !selectedCity ? selectedDemoKey : undefined,
    });
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-5 bg-[#0F172A] text-white flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-teal-300 font-medium">
              Step {step} of 5 · Personalize BreatheWise AI
            </p>
            <h1 className="text-xl font-semibold mt-1">
              {step === 1 && 'Select your city or demo scenario'}
              {step === 2 && 'Choose your clean-air priorities'}
              {step === 3 && 'Optional lifestyle profile'}
              {step === 4 && 'Optional daily schedule'}
              {step === 5 && 'Ready to build your clean-air plan'}
            </h1>
          </div>
          <button
            type="button"
            onClick={onSkip}
            className="text-xs font-medium text-slate-200 hover:text-white underline underline-offset-4 whitespace-nowrap py-2"
          >
            Skip setup
          </button>
        </div>

        <div
          className="h-1.5 bg-slate-100"
          role="progressbar"
          aria-label="Onboarding setup progress"
          aria-valuemin={1}
          aria-valuemax={5}
          aria-valuenow={step}
        >
          <div
            className="h-full bg-teal-600 transition-all duration-300"
            style={{ width: `${(step / 5) * 100}%` }}
          />
        </div>

        <div className="p-6 sm:p-8">
          {step === 1 && (
            <div className="space-y-5">
              <p className="text-sm text-slate-700">
                Search for your city for live Open-Meteo environmental readings, or choose a clearly
                labeled demonstration scenario to explore immediately.
              </p>

              <form onSubmit={handleSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <Search
                    className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    value={cityQuery}
                    onChange={(e) => setCityQuery(e.target.value)}
                    placeholder="Enter city name (e.g., Delhi, Mumbai, London, Toronto)"
                    aria-label="Search city"
                    className="w-full pl-9 pr-3 py-2.5 min-h-[44px] text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <button
                  type="submit"
                  disabled={searching || cityQuery.trim().length < 2}
                  className="px-4 py-2.5 min-h-[44px] text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-50 whitespace-nowrap"
                >
                  {searching ? 'Searching...' : 'Search'}
                </button>
              </form>

              {searchErr && (
                <p role="alert" className="text-xs text-red-700">
                  {searchErr}
                </p>
              )}

              {cityResults.length > 0 && (
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-44 overflow-y-auto">
                  {cityResults.map((c) => {
                    const active = selectedCity?.id === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          setSelectedCity(c);
                          setSelectedDemoKey(undefined);
                        }}
                        className={`w-full px-3.5 py-2.5 min-h-[44px] text-left flex items-center justify-between text-sm ${
                          active ? 'bg-teal-50 text-teal-950 font-medium' : 'hover:bg-slate-50'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-teal-700 shrink-0" aria-hidden="true" />
                          {c.name}
                          {c.admin1 ? `, ${c.admin1}` : ''} ({c.country})
                        </span>
                        {active && <Check className="w-4 h-4 text-teal-700" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                  Or start with a Demo Scenario (No setup required)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {DEMO_SCENARIOS.map((preset) => {
                    const active = !selectedCity && selectedDemoKey === preset.key;
                    return (
                      <button
                        key={preset.key}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          setSelectedCity(undefined);
                          setSelectedDemoKey(preset.key);
                        }}
                        className={`p-3 min-h-[54px] rounded-lg border text-left transition-colors ${
                          active
                            ? 'border-teal-600 bg-teal-50 text-teal-950'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="text-xs font-semibold">{preset.label}</div>
                        <div className="text-[11px] text-slate-600 mt-0.5">
                          Simulated demo data
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-slate-700">
                Select what matters most to your household today. You can adjust this anytime in Settings.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {PRIORITY_OPTIONS.map((opt) => {
                  const selected = priorities.includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => togglePriority(opt)}
                      className={`p-3.5 min-h-[48px] rounded-lg border text-left flex items-center justify-between transition-colors ${
                        selected
                          ? 'border-teal-600 bg-teal-50 text-teal-950 font-medium'
                          : 'border-slate-200 text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-sm">{opt}</span>
                      {selected && <Check className="w-4 h-4 text-teal-700 shrink-0" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-slate-700">
                Optional: choose the role that best reflects your daily exposure pattern. No personal
                medical data is required.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {ROLE_OPTIONS.map((opt) => {
                  const selected = role === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setRole(opt.id)}
                      className={`p-3.5 min-h-[60px] rounded-lg border text-left transition-colors ${
                        selected
                          ? 'border-teal-600 bg-teal-50 text-teal-950'
                          : 'border-slate-200 text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      <div className="text-sm font-semibold">{opt.label}</div>
                      <div className="text-xs text-slate-600 mt-0.5">{opt.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <p className="text-sm text-slate-700">
                Optional: share your typical routine so the Daily Planner can time commutes and indoor
                alternatives accurately.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="onboard-wake" className="block text-xs font-medium text-slate-800 mb-1">
                    Wake-up time
                  </label>
                  <input
                    id="onboard-wake"
                    type="time"
                    value={schedule.wakeTime}
                    onChange={(e) => setSchedule({ ...schedule, wakeTime: e.target.value })}
                    className="w-full px-3 py-2 min-h-[42px] text-sm border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="onboard-bed" className="block text-xs font-medium text-slate-800 mb-1">
                    Bedtime
                  </label>
                  <input
                    id="onboard-bed"
                    type="time"
                    value={schedule.bedTime}
                    onChange={(e) => setSchedule({ ...schedule, bedTime: e.target.value })}
                    className="w-full px-3 py-2 min-h-[42px] text-sm border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="onboard-commute" className="block text-xs font-medium text-slate-800 mb-1">
                    Primary commute mode
                  </label>
                  <select
                    id="onboard-commute"
                    value={schedule.commuteMode}
                    onChange={(e) =>
                      setSchedule({
                        ...schedule,
                        commuteMode: e.target.value as UserPreferences['schedule']['commuteMode'],
                      })
                    }
                    className="w-full px-3 py-2 min-h-[42px] text-sm border border-slate-300 rounded-lg bg-white"
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
                  <label htmlFor="onboard-exercise" className="block text-xs font-medium text-slate-800 mb-1">
                    Preferred exercise
                  </label>
                  <select
                    id="onboard-exercise"
                    value={schedule.preferredExercise}
                    onChange={(e) =>
                      setSchedule({
                        ...schedule,
                        preferredExercise: e.target.value as UserPreferences['schedule']['preferredExercise'],
                      })
                    }
                    className="w-full px-3 py-2 min-h-[42px] text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="walking">Walking</option>
                    <option value="running">Running</option>
                    <option value="cycling">Cycling</option>
                    <option value="yoga">Yoga</option>
                    <option value="gym_indoor">Indoor gym / home workout</option>
                    <option value="none">No scheduled exercise</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 text-sm">
                <div className="flex items-center gap-2 font-semibold text-slate-900">
                  <Sparkles className="w-4 h-4 text-teal-700" aria-hidden="true" />
                  Your BreatheWise Configuration
                </div>
                <p className="text-slate-700">
                  <strong>Location:</strong>{' '}
                  {selectedCity
                    ? `${selectedCity.name}, ${selectedCity.country} (Live Open-Meteo data)`
                    : `${
                        DEMO_SCENARIOS.find((d) => d.key === selectedDemoKey)?.label ??
                        'Demo Scenario'
                      }`}
                </p>
                <p className="text-slate-700">
                  <strong>Priorities:</strong>{' '}
                  {priorities.length > 0 ? priorities.join(', ') : 'General clean-air guidance'}
                </p>
                <p className="text-slate-700">
                  <strong>Routine:</strong> Wake {schedule.wakeTime} · Commute via{' '}
                  {schedule.commuteMode.replace('_', ' ')} · Exercise:{' '}
                  {schedule.preferredExercise.replace('_', ' ')}
                </p>
              </div>
              <div className="flex items-start gap-2.5 text-xs text-slate-700">
                <Shield className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" aria-hidden="true" />
                <p>
                  Preferences are stored only in your browser with one-click export and full reset in
                  Settings. BreatheWise provides environmental guidance, not medical diagnosis.
                </p>
              </div>
            </div>
          )}

          <div className="mt-8 pt-5 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1}
              className="px-4 py-2 min-h-[42px] text-sm font-medium text-slate-700 hover:text-slate-900 disabled:opacity-40"
            >
              Back
            </button>

            {step < 5 ? (
              <button
                type="button"
                onClick={() => setStep((s) => Math.min(5, s + 1))}
                className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
              >
                Continue
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={finishSetup}
                className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
              >
                Generate My Clean-Air Plan
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
