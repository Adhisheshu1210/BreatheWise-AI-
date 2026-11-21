import type {
  AirQualitySnapshot,
  NotificationEntry,
  UserPreferences,
} from '../types/airQuality.ts';
import { getAqiCategory, isWithinQuietHours } from './aqi.ts';

export function evaluateInAppNotifications(params: {
  snapshot: AirQualitySnapshot;
  notificationPrefs: UserPreferences['notifications'];
  existing: NotificationEntry[];
  now?: Date;
}): NotificationEntry[] {
  const now = params.now ?? new Date();
  const { snapshot, notificationPrefs, existing } = params;
  const usAqi = snapshot.currentUsAqi;
  const cat = getAqiCategory(usAqi, 'us_aqi');
  const quiet = isWithinQuietHours(notificationPrefs.quietStart, notificationPrefs.quietEnd, now);
  const todayKey = now.toISOString().slice(0, 10);
  const timestampIso = now.toISOString();

  const additions: NotificationEntry[] = [];

  if (
    notificationPrefs.enableInAppAlerts &&
    usAqi !== null &&
    usAqi >= notificationPrefs.aqiThreshold &&
    (!quiet || usAqi > 200)
  ) {
    const dedupeKey = `${snapshot.location.id}-${usAqi}-${snapshot.isDemo ? 'demo' : 'live'}`;
    if (!existing.some((n) => n.id === dedupeKey)) {
      additions.push({
        id: dedupeKey,
        timestampIso,
        type: 'aqi_alert',
        severity: usAqi > 200 ? 'severe' : usAqi > 150 ? 'elevated' : 'warning',
        title: `${snapshot.isDemo ? '[Demo] ' : ''}${cat.label} Alert (US AQI ${usAqi})`,
        body: `Threshold (${notificationPrefs.aqiThreshold}) exceeded in ${snapshot.location.name}. ${cat.outdoorGuidance}`,
        locationName: snapshot.location.name,
        read: false,
      });
    }
  }

  if (notificationPrefs.dailySummary && !quiet) {
    const summaryId = `summary-${snapshot.location.id}-${todayKey}-${
      snapshot.isDemo ? 'demo' : 'live'
    }`;
    if (!existing.some((n) => n.id === summaryId)) {
      additions.push({
        id: summaryId,
        timestampIso,
        type: 'daily_summary',
        severity: 'info',
        title: `${snapshot.isDemo ? '[Demo] ' : ''}Daily Summary · ${snapshot.location.name}`,
        body: `US AQI ${usAqi ?? 'N/A'} (${cat.label}). ${cat.summary}`,
        locationName: snapshot.location.name,
        read: false,
      });
    }
  }

  if (notificationPrefs.indoorTips && !quiet && usAqi !== null && usAqi > 100) {
    const tipId = `indoor-tip-${snapshot.location.id}-${todayKey}-${
      snapshot.isDemo ? 'demo' : 'live'
    }`;
    if (!existing.some((n) => n.id === tipId)) {
      additions.push({
        id: tipId,
        timestampIso,
        type: 'indoor',
        severity: 'info',
        title: `${snapshot.isDemo ? '[Demo] ' : ''}Indoor Air Care Reminder`,
        body: cat.ventilationGuidance,
        locationName: snapshot.location.name,
        read: false,
      });
    }
  }

  if (additions.length === 0) return existing;
  return [...additions, ...existing].slice(0, 25);
}
