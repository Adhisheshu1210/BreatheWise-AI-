import { useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Check,
  Download,
  Info,
  RotateCcw,
  Shield,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import type {
  NotificationEntry,
  UserPreferences,
} from '../types/airQuality.ts';
import { isWithinQuietHours } from '../utils/aqi.ts';

interface NotificationsViewProps {
  notifications: NotificationEntry[];
  prefs: UserPreferences;
  onUpdatePrefs: (next: UserPreferences) => void;
  onMarkAllRead: () => void;
  onClearNotifications: () => void;
}

export function NotificationsView({
  notifications,
  prefs,
  onUpdatePrefs,
  onMarkAllRead,
  onClearNotifications,
}: NotificationsViewProps) {
  const quietNow = isWithinQuietHours(
    prefs.notifications.quietStart,
    prefs.notifications.quietEnd
  );

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Notifications & Alert Center</h1>
            <p className="text-xs text-slate-500 mt-1">
              In-app environmental alerts, daily summaries, and quiet-hour thresholds.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onMarkAllRead}
              disabled={notifications.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
            >
              <Check className="w-3.5 h-3.5" />
              Mark All Read
            </button>
            <button
              type="button"
              onClick={onClearNotifications}
              disabled={notifications.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-40"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear History
            </button>
          </div>
        </div>

        <div className="mt-4 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-2">
          <Info className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
          <span>
            <strong>In-App Alerts Only:</strong> Background browser push notifications are not
            registered; alerts appear inside this workspace when live or demo AQI readings cross
            your chosen threshold.
            {quietNow && (
              <>
                {' '}
                <strong className="text-slate-900">
                  Quiet hours active ({prefs.notifications.quietStart}–
                  {prefs.notifications.quietEnd}):
                </strong>{' '}
                non-severe notifications are muted right now.
              </>
            )}
          </span>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3.5">
            <h2 className="text-sm font-semibold text-slate-900">Alert Preferences</h2>
            <div>
              <label htmlFor="alert-threshold" className="block text-xs font-medium text-slate-700 mb-1">
                US AQI Alert Threshold ({prefs.notifications.aqiThreshold})
              </label>
              <input
                id="alert-threshold"
                type="range"
                min={50}
                max={250}
                step={10}
                value={prefs.notifications.aqiThreshold}
                onChange={(e) =>
                  onUpdatePrefs({
                    ...prefs,
                    notifications: {
                      ...prefs.notifications,
                      aqiThreshold: Number(e.target.value),
                    },
                  })
                }
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="quiet-start" className="block text-xs font-medium text-slate-700 mb-1">
                  Quiet Hours Start
                </label>
                <input
                  id="quiet-start"
                  type="time"
                  value={prefs.notifications.quietStart}
                  onChange={(e) =>
                    onUpdatePrefs({
                      ...prefs,
                      notifications: { ...prefs.notifications, quietStart: e.target.value },
                    })
                  }
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                />
              </div>
              <div>
                <label htmlFor="quiet-end" className="block text-xs font-medium text-slate-700 mb-1">
                  Quiet Hours End
                </label>
                <input
                  id="quiet-end"
                  type="time"
                  value={prefs.notifications.quietEnd}
                  onChange={(e) =>
                    onUpdatePrefs({
                      ...prefs,
                      notifications: { ...prefs.notifications, quietEnd: e.target.value },
                    })
                  }
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                />
              </div>
            </div>

            <div className="space-y-2 pt-1 text-xs">
              <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={prefs.notifications.enableInAppAlerts}
                  onChange={(e) =>
                    onUpdatePrefs({
                      ...prefs,
                      notifications: {
                        ...prefs.notifications,
                        enableInAppAlerts: e.target.checked,
                      },
                    })
                  }
                />
                Enable in-app AQI & spike alerts
              </label>
              <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={prefs.notifications.dailySummary}
                  onChange={(e) =>
                    onUpdatePrefs({
                      ...prefs,
                      notifications: {
                        ...prefs.notifications,
                        dailySummary: e.target.checked,
                      },
                    })
                  }
                />
                Include daily air quality summary
              </label>
              <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={prefs.notifications.indoorTips}
                  onChange={(e) =>
                    onUpdatePrefs({
                      ...prefs,
                      notifications: {
                        ...prefs.notifications,
                        indoorTips: e.target.checked,
                      },
                    })
                  }
                />
                Include indoor care reminders
              </label>
            </div>
          </div>

          <div className="lg:col-span-8">
            {notifications.length === 0 ? (
              <div className="p-10 border border-slate-200 rounded-xl text-center text-xs text-slate-600">
                <Bell className="w-8 h-8 text-slate-500 mx-auto mb-2" aria-hidden="true" />
                No notifications in your history right now.
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                {notifications.map((n) => {
                  const SevIcon =
                    n.severity === 'severe'
                      ? ShieldAlert
                      : n.severity === 'elevated' || n.severity === 'warning'
                      ? AlertTriangle
                      : Info;
                  const sevColor =
                    n.severity === 'severe'
                      ? 'text-red-700'
                      : n.severity === 'elevated' || n.severity === 'warning'
                      ? 'text-amber-700'
                      : 'text-teal-700';
                  return (
                    <div
                      key={n.id}
                      className={`p-4 flex items-start gap-3 text-xs ${
                        n.read ? 'bg-white' : 'bg-teal-50/40'
                      }`}
                    >
                      <SevIcon className={`w-4 h-4 shrink-0 mt-0.5 ${sevColor}`} aria-hidden="true" />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-900">
                          {n.title}{' '}
                          {!n.read && (
                            <span className="text-[11px] font-semibold text-teal-800 ml-1">
                              · Unread
                            </span>
                          )}
                        </div>
                        <p className="text-slate-700 mt-1">{n.body}</p>
                        <div className="text-[11px] text-slate-600 mt-1">
                          {n.locationName} ·{' '}
                          {Number.isNaN(Date.parse(n.timestampIso))
                            ? 'Recent'
                            : new Date(n.timestampIso).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

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
              <div className="inline-flex p-1 bg-slate-100 rounded-lg" role="group" aria-label="Temperature unit">
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
