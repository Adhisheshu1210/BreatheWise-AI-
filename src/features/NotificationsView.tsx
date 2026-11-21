import {
  AlertTriangle,
  Bell,
  Check,
  Info,
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
