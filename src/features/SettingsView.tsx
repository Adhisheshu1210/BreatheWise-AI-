import { useState } from 'react';
import { Download, RotateCcw, Shield, Trash2 } from 'lucide-react';
import type { UserPreferences } from '../types/airQuality.ts';

interface SettingsViewProps {
  prefs: UserPreferences;
  onUpdatePrefs: (next: UserPreferences) => void;
  onClearChat: () => void;
  onClearLogs: () => void;
  onResetAll: () => void;
  onReplayOnboarding: () => void;
  onExportAllData: () => boolean;
}

export function SettingsView({
  prefs,
  onUpdatePrefs,
  onClearChat,
  onClearLogs,
  onResetAll,
  onReplayOnboarding,
  onExportAllData,
}: SettingsViewProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-6">
        <div className="pb-4 border-b border-slate-100">
          <h1 className="text-xl font-bold text-slate-900">Personalization, Privacy & Settings</h1>
          <p className="text-xs text-slate-500 mt-1">
            Control units, AQI scale, accessibility options, and local browser data.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-900">Measurement & Display</h2>
            <div>
              <label htmlFor="settings-aqi-standard" className="block text-xs font-medium text-slate-700 mb-1">
                AQI Standard
              </label>
              <select
                id="settings-aqi-standard"
                value={prefs.aqiStandard}
                onChange={(e) =>
                  onUpdatePrefs({
                    ...prefs,
                    aqiStandard: e.target.value as UserPreferences['aqiStandard'],
                  })
                }
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="us_aqi">US EPA AQI (0–500 scale)</option>
                <option value="eaqi">European Air Quality Index (EAQI)</option>
              </select>
            </div>
            <div>
              <span className="block text-xs font-medium text-slate-700 mb-1">
                Temperature Unit
              </span>
              <div
                className="inline-flex p-1 bg-slate-100 rounded-lg"
                role="group"
                aria-label="Temperature unit"
              >
                {(['C', 'F'] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    aria-pressed={prefs.tempUnit === u}
                    onClick={() => onUpdatePrefs({ ...prefs, tempUnit: u })}
                    className={`px-4 py-1.5 text-xs font-medium rounded-md ${
                      prefs.tempUnit === u ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    °{u}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="settings-lifestyle-role" className="block text-xs font-medium text-slate-700 mb-1">
                Lifestyle Role
              </label>
              <select
                id="settings-lifestyle-role"
                value={prefs.lifestyleRole}
                onChange={(e) =>
                  onUpdatePrefs({
                    ...prefs,
                    lifestyleRole: e.target.value as UserPreferences['lifestyleRole'],
                  })
                }
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="general">General User</option>
                <option value="parent">Parent / Caregiver</option>
                <option value="office_worker">Office Worker</option>
                <option value="student">Student</option>
                <option value="outdoor_worker">Outdoor Worker</option>
                <option value="senior">Senior Citizen</option>
              </select>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-900">Accessibility Preferences</h2>
            <div className="space-y-2.5 text-xs">
              <label className="flex items-center gap-2.5 text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={prefs.accessibility.highContrast}
                  onChange={(e) =>
                    onUpdatePrefs({
                      ...prefs,
                      accessibility: {
                        ...prefs.accessibility,
                        highContrast: e.target.checked,
                      },
                    })
                  }
                />
                Enhanced visual contrast mode
              </label>
              <label className="flex items-center gap-2.5 text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={prefs.accessibility.largeText}
                  onChange={(e) =>
                    onUpdatePrefs({
                      ...prefs,
                      accessibility: {
                        ...prefs.accessibility,
                        largeText: e.target.checked,
                      },
                    })
                  }
                />
                Larger readable text scale
              </label>
              <label className="flex items-center gap-2.5 text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={prefs.accessibility.reducedMotion}
                  onChange={(e) =>
                    onUpdatePrefs({
                      ...prefs,
                      accessibility: {
                        ...prefs.accessibility,
                        reducedMotion: e.target.checked,
                      },
                    })
                  }
                />
                Reduce interface motion & transitions
              </label>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={onReplayOnboarding}
                className="px-4 py-2 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Re-run First-Time Setup Guide
              </button>
            </div>
          </div>
        </div>

        {/* Data & Privacy Controls */}
        <div className="pt-5 border-t border-slate-100 space-y-4">
          <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
            <Shield className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
            <div>
              <strong>Data & Privacy Transparency:</strong> Preferences, saved cities, exposure logs,
              and chat history are stored locally in your browser’s <code>localStorage</code> and
              never sold or written to a third-party profile database. Live city queries only send
              latitude/longitude coordinates to Open-Meteo; AI requests are proxied securely
              through the server without exposing API keys in the browser.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                const exported = onExportAllData();
                setActionFeedback(
                  exported
                    ? 'Exported BreatheWise activity data JSON.'
                    : 'File export is unavailable in this browser environment.'
                );
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-800 border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              <Download className="w-3.5 h-3.5" />
              Export All Activity Data (JSON)
            </button>
            <button
              type="button"
              onClick={() => {
                onClearChat();
                setActionFeedback('Chat history cleared.');
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-800 border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear Chat History
            </button>
            <button
              type="button"
              onClick={() => {
                onClearLogs();
                setActionFeedback('Exposure logs deleted.');
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-800 border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Exposure Logs
            </button>

            {!confirmReset ? (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-red-700 border border-red-200 rounded-lg hover:bg-red-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Application Data
              </button>
            ) : (
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    onResetAll();
                    setConfirmReset(false);
                    setActionFeedback('All application preferences and local records reset.');
                  }}
                  className="px-3 py-2 bg-red-600 text-white rounded-lg font-medium"
                >
                  Confirm Full Reset
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="px-2 py-2 text-slate-600"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
          {actionFeedback && (
            <p className="text-xs text-teal-800 font-medium" role="status">
              {actionFeedback}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
