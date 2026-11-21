import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from './components/AppShell.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { LocationSelectorModal } from './components/LocationSelectorModal.tsx';
import { OnboardingFlow } from './components/OnboardingFlow.tsx';
import { DEFAULT_PREFS } from './config/appConfig.ts';
import {
  DEFAULT_INDOOR_PROFILE,
  DEMO_SCENARIOS,
  INITIAL_COMMUNITY_INITIATIVES,
  INITIAL_SUSTAINABILITY_GOALS,
  SAMPLE_EXPOSURE_LOGS,
} from './data/demoData.ts';
import { DailyPlannerView } from './features/DailyPlannerView.tsx';
import { DashboardView } from './features/DashboardView.tsx';
import { ExposureTrackerView } from './features/ExposureTrackerView.tsx';
import { FamilyProtectionView } from './features/FamilyProtectionView.tsx';
import { IndoorAirCareView } from './features/IndoorAirCareView.tsx';
import { NotificationsView } from './features/NotificationsView.tsx';
import { SettingsView } from './features/SettingsView.tsx';
import { SustainableLivingView } from './features/SustainableLivingView.tsx';
import { useLocalStorage } from './hooks/useLocalStorage.ts';
import {
  clearAiResponseCache,
  fetchAirQualityApi,
  fetchServerHealth,
} from './services/apiClient.ts';
import type {
  AirQualitySnapshot,
  ChatMessage,
  CommunityInitiative,
  DailyPlanItem,
  ExposureLogEntry,
  IndoorHomeProfile,
  LocationResult,
  NavSection,
  NotificationEntry,
  SustainabilityGoal,
  UserPreferences,
} from './types/airQuality.ts';
import {
  buildPersonalizedDailyPlan,
  getAqiCategory,
  isWithinQuietHours,
} from './utils/aqi.ts';
import { downloadJsonFile } from './utils/exportJson.ts';

const AirQualityMapView = lazy(() =>
  import('./features/AirQualityMapView.tsx').then((m) => ({
    default: m.AirQualityMapView,
  }))
);
const AssistantView = lazy(() =>
  import('./features/AssistantView.tsx').then((m) => ({
    default: m.AssistantView,
  }))
);
const CommuteAssistantView = lazy(() =>
  import('./features/CommuteAssistantView.tsx').then((m) => ({
    default: m.CommuteAssistantView,
  }))
);
const CommunityActionView = lazy(() =>
  import('./features/CommunityActionView.tsx').then((m) => ({
    default: m.CommunityActionView,
  }))
);
const EducationCenterView = lazy(() =>
  import('./features/EducationCenterView.tsx').then((m) => ({
    default: m.EducationCenterView,
  }))
);

export default function App() {
  const [prefs, setPrefs] = useLocalStorage<UserPreferences>('bw_prefs_v1', DEFAULT_PREFS);
  const [favorites, setFavorites] = useLocalStorage<LocationResult[]>('bw_fav_locs_v1', []);
  const [recentLocs, setRecentLocs] = useLocalStorage<LocationResult[]>('bw_recent_locs_v1', []);
  const [selectedLiveLoc, setSelectedLiveLoc] = useLocalStorage<LocationResult | null>(
    'bw_selected_live_loc_v1',
    null
  );
  const [demoScenarioKey, setDemoScenarioKey] = useLocalStorage<string>(
    'bw_demo_key_v1',
    'demo-delhi'
  );
  const [homeProfile, setHomeProfile] = useLocalStorage<IndoorHomeProfile>(
    'bw_home_profile_v1',
    DEFAULT_INDOOR_PROFILE
  );
  const [customPlan, setCustomPlan] = useLocalStorage<DailyPlanItem[] | null>(
    'bw_daily_plan_v1',
    null
  );
  const [exposureLogs, setExposureLogs] = useLocalStorage<ExposureLogEntry[]>(
    'bw_exposure_logs_v1',
    SAMPLE_EXPOSURE_LOGS
  );
  const [sustainabilityGoals, setSustainabilityGoals] = useLocalStorage<SustainabilityGoal[]>(
    'bw_sustainability_goals_v1',
    INITIAL_SUSTAINABILITY_GOALS
  );
  const [communityInitiatives, setCommunityInitiatives] = useLocalStorage<CommunityInitiative[]>(
    'bw_community_v1',
    INITIAL_COMMUNITY_INITIATIVES
  );
  const [chatMessages, setChatMessages] = useLocalStorage<ChatMessage[]>('bw_chat_v1', []);
  const [notifications, setNotifications] = useLocalStorage<NotificationEntry[]>(
    'bw_notifications_v1',
    []
  );

  const [activeNav, setActiveNav] = useState<NavSection>('dashboard');
  const [locationModalOpen, setLocationModalOpen] = useState(false);

  const [liveSnapshot, setLiveSnapshot] = useState<AirQualitySnapshot | null>(null);
  const [loadingAqi, setLoadingAqi] = useState(false);
  const [aqiError, setAqiError] = useState<string | null>(null);
  const [geminiConfigured, setGeminiConfigured] = useState(false);

  const liveFetchControllerRef = useRef<AbortController | null>(null);
  const liveRequestSeqRef = useRef(0);

  useEffect(() => {
    fetchServerHealth()
      .then((h) => setGeminiConfigured(Boolean(h.geminiConfigured)))
      .catch(() => setGeminiConfigured(false));
    return () => {
      liveFetchControllerRef.current?.abort();
    };
  }, []);

  const loadLiveCity = useCallback(async (loc: LocationResult) => {
    liveFetchControllerRef.current?.abort();
    const controller = new AbortController();
    liveFetchControllerRef.current = controller;
    const reqId = ++liveRequestSeqRef.current;

    setLoadingAqi(true);
    setAqiError(null);
    try {
      const snap = await fetchAirQualityApi(loc, controller.signal);
      if (reqId !== liveRequestSeqRef.current) return;
      setLiveSnapshot(snap);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (reqId !== liveRequestSeqRef.current) return;
      setAqiError(
        err instanceof Error ? err.message : 'Unable to retrieve live environmental data.'
      );
      setLiveSnapshot(null);
    } finally {
      if (reqId === liveRequestSeqRef.current) {
        setLoadingAqi(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!prefs.demoMode && selectedLiveLoc) {
      void loadLiveCity(selectedLiveLoc);
    }
  }, [prefs.demoMode, selectedLiveLoc, loadLiveCity]);

  const activeSnapshot: AirQualitySnapshot | null = useMemo(() => {
    if (prefs.demoMode) {
      const found =
        DEMO_SCENARIOS.find((d) => d.key === demoScenarioKey) ?? DEMO_SCENARIOS[0];
      return found.snapshot;
    }
    return liveSnapshot;
  }, [prefs.demoMode, demoScenarioKey, liveSnapshot]);

  // Generate in-app alert if threshold is crossed (respecting quiet hours for non-severe alerts)
  useEffect(() => {
    if (!activeSnapshot) return;
    const usAqi = activeSnapshot.currentUsAqi;
    const cat = getAqiCategory(usAqi, 'us_aqi');
    const quiet = isWithinQuietHours(
      prefs.notifications.quietStart,
      prefs.notifications.quietEnd
    );
    const todayKey = new Date().toISOString().slice(0, 10);

    setNotifications((prev) => {
      const additions: NotificationEntry[] = [];

      if (
        prefs.notifications.enableInAppAlerts &&
        usAqi !== null &&
        usAqi >= prefs.notifications.aqiThreshold &&
        (!quiet || usAqi > 200)
      ) {
        const dedupeKey = `${activeSnapshot.location.id}-${usAqi}-${
          activeSnapshot.isDemo ? 'demo' : 'live'
        }`;
        if (!prev.some((n) => n.id === dedupeKey)) {
          additions.push({
            id: dedupeKey,
            timestampIso: new Date().toISOString(),
            type: 'aqi_alert',
            severity: usAqi > 200 ? 'severe' : usAqi > 150 ? 'elevated' : 'warning',
            title: `${activeSnapshot.isDemo ? '[Demo] ' : ''}${cat.label} Alert (US AQI ${usAqi})`,
            body: `Threshold (${prefs.notifications.aqiThreshold}) exceeded in ${activeSnapshot.location.name}. ${cat.outdoorGuidance}`,
            locationName: activeSnapshot.location.name,
            read: false,
          });
        }
      }

      if (prefs.notifications.dailySummary && !quiet) {
        const summaryId = `summary-${activeSnapshot.location.id}-${todayKey}-${
          activeSnapshot.isDemo ? 'demo' : 'live'
        }`;
        if (!prev.some((n) => n.id === summaryId)) {
          additions.push({
            id: summaryId,
            timestampIso: new Date().toISOString(),
            type: 'daily_summary',
            severity: 'info',
            title: `${activeSnapshot.isDemo ? '[Demo] ' : ''}Daily Summary · ${
              activeSnapshot.location.name
            }`,
            body: `US AQI ${usAqi ?? 'N/A'} (${cat.label}). ${cat.summary}`,
            locationName: activeSnapshot.location.name,
            read: false,
          });
        }
      }

      if (prefs.notifications.indoorTips && !quiet && usAqi !== null && usAqi > 100) {
        const tipId = `indoor-tip-${activeSnapshot.location.id}-${todayKey}-${
          activeSnapshot.isDemo ? 'demo' : 'live'
        }`;
        if (!prev.some((n) => n.id === tipId)) {
          additions.push({
            id: tipId,
            timestampIso: new Date().toISOString(),
            type: 'indoor',
            severity: 'info',
            title: `${activeSnapshot.isDemo ? '[Demo] ' : ''}Indoor Air Care Reminder`,
            body: cat.ventilationGuidance,
            locationName: activeSnapshot.location.name,
            read: false,
          });
        }
      }

      if (additions.length === 0) return prev;
      return [...additions, ...prev].slice(0, 25);
    });
  }, [
    activeSnapshot,
    prefs.notifications.aqiThreshold,
    prefs.notifications.enableInAppAlerts,
    prefs.notifications.dailySummary,
    prefs.notifications.indoorTips,
    prefs.notifications.quietStart,
    prefs.notifications.quietEnd,
    setNotifications,
  ]);

  const effectiveDailyPlan = useMemo(() => {
    if (customPlan && customPlan.length > 0) return customPlan;
    if (!activeSnapshot) return [];
    return buildPersonalizedDailyPlan({
      snapshot: activeSnapshot,
      schedule: prefs.schedule,
      role: prefs.lifestyleRole,
      hasSensitiveFamily: prefs.household.length > 0,
    });
  }, [customPlan, activeSnapshot, prefs.schedule, prefs.lifestyleRole, prefs.household.length]);

  const handleSelectLiveLocation = useCallback(
    (loc: LocationResult) => {
      setSelectedLiveLoc(loc);
      setPrefs((p) => ({ ...p, demoMode: false }));
      setRecentLocs((prev) => [loc, ...prev.filter((i) => i.id !== loc.id)].slice(0, 6));
      setCustomPlan(null);
      setAqiError(null);
    },
    [setSelectedLiveLoc, setPrefs, setRecentLocs, setCustomPlan]
  );

  const handleSelectDemoScenario = useCallback(
    (key: string) => {
      liveFetchControllerRef.current?.abort();
      setDemoScenarioKey(key);
      setPrefs((p) => ({ ...p, demoMode: true }));
      setCustomPlan(null);
      setAqiError(null);
    },
    [setDemoScenarioKey, setPrefs, setCustomPlan]
  );

  const handleToggleFavorite = useCallback(
    (loc: LocationResult) => {
      setFavorites((prev) =>
        prev.some((f) => f.id === loc.id)
          ? prev.filter((f) => f.id !== loc.id)
          : [loc, ...prev]
      );
    },
    [setFavorites]
  );

  const handleResetAllData = useCallback(() => {
    liveFetchControllerRef.current?.abort();
    clearAiResponseCache();
    try {
      window.localStorage.clear();
    } catch {
      // ignore
    }
    setPrefs({ ...DEFAULT_PREFS, onboardingCompleted: true });
    setFavorites([]);
    setRecentLocs([]);
    setSelectedLiveLoc(null);
    setDemoScenarioKey('demo-delhi');
    setHomeProfile(DEFAULT_INDOOR_PROFILE);
    setCustomPlan(null);
    setExposureLogs([]);
    setSustainabilityGoals(INITIAL_SUSTAINABILITY_GOALS);
    setCommunityInitiatives(INITIAL_COMMUNITY_INITIATIVES);
    setChatMessages([]);
    setNotifications([]);
    setAqiError(null);
  }, [
    setPrefs,
    setFavorites,
    setRecentLocs,
    setSelectedLiveLoc,
    setDemoScenarioKey,
    setHomeProfile,
    setCustomPlan,
    setExposureLogs,
    setSustainabilityGoals,
    setCommunityInitiatives,
    setChatMessages,
    setNotifications,
  ]);

  const handleExportAllData = useCallback((): boolean => {
    return downloadJsonFile(
      `breathewise-export-${new Date().toISOString().slice(0, 10)}.json`,
      {
        exportedAt: new Date().toISOString(),
        preferences: prefs,
        favorites,
        homeProfile,
        dailyPlan: effectiveDailyPlan,
        exposureLogs,
        sustainabilityGoals,
      }
    );
  }, [prefs, favorites, homeProfile, effectiveDailyPlan, exposureLogs, sustainabilityGoals]);

  if (!prefs.onboardingCompleted) {
    return (
      <OnboardingFlow
        initialPrefs={prefs}
        onSkip={() => setPrefs((p) => ({ ...p, onboardingCompleted: true }))}
        onComplete={({ prefs: nextPrefs, selectedLocation, demoKey }) => {
          setPrefs(nextPrefs);
          if (selectedLocation) {
            setSelectedLiveLoc(selectedLocation);
            setRecentLocs((prev) =>
              [selectedLocation, ...prev.filter((i) => i.id !== selectedLocation.id)].slice(0, 6)
            );
          } else if (demoKey) {
            setDemoScenarioKey(demoKey);
          }
          setCustomPlan(null);
        }}
      />
    );
  }

  const unreadAlerts = notifications.filter((n) => !n.read).length;

  return (
    <>
      <AppShell
        activeNav={activeNav}
        onSelectNav={setActiveNav}
        prefs={prefs}
        activeSnapshot={activeSnapshot}
        unreadAlerts={unreadAlerts}
        hasSelectedLiveLoc={Boolean(selectedLiveLoc)}
        onOpenLocationModal={() => setLocationModalOpen(true)}
        onSwitchToLive={() => setPrefs((p) => ({ ...p, demoMode: false }))}
        onSwitchToDemo={() => {
          setPrefs((p) => ({ ...p, demoMode: true }));
          setAqiError(null);
        }}
        onChangeAqiStandard={(standard) =>
          setPrefs((p) => ({ ...p, aqiStandard: standard }))
        }
      >
        <ErrorBoundary
          key={activeNav}
          fallbackTitle="Unable to display this workspace section"
          onReset={() => setActiveNav('dashboard')}
        >
          <Suspense
            fallback={
              <div
                role="status"
                aria-live="polite"
                className="bg-white border border-slate-200 rounded-xl p-10 text-center text-xs text-slate-600"
              >
                Loading module...
              </div>
            }
          >
            {activeNav === 'dashboard' && (
              <DashboardView
                snapshot={activeSnapshot}
                loading={loadingAqi}
                error={aqiError}
                prefs={prefs}
                dailyPlan={effectiveDailyPlan}
                onRetry={() => selectedLiveLoc && loadLiveCity(selectedLiveLoc)}
                onOpenLocationModal={() => setLocationModalOpen(true)}
                onNavigate={setActiveNav}
                onSwitchToDemo={() => {
                  setPrefs((p) => ({ ...p, demoMode: true }));
                  setAqiError(null);
                }}
              />
            )}

            {activeNav === 'map' && (
              <AirQualityMapView
                snapshot={activeSnapshot}
                aqiStandard={prefs.aqiStandard}
                onOpenLocationModal={() => setLocationModalOpen(true)}
              />
            )}

            {activeNav === 'planner' && (
              <DailyPlannerView
                snapshot={activeSnapshot}
                prefs={prefs}
                homeProfile={homeProfile}
                sustainabilityGoals={sustainabilityGoals}
                exposureLogs={exposureLogs}
                plan={effectiveDailyPlan}
                geminiConfigured={geminiConfigured}
                onUpdatePlan={setCustomPlan}
                onUpdatePrefs={setPrefs}
              />
            )}

            {activeNav === 'indoor' && (
              <IndoorAirCareView
                snapshot={activeSnapshot}
                prefs={prefs}
                homeProfile={homeProfile}
                sustainabilityGoals={sustainabilityGoals}
                geminiConfigured={geminiConfigured}
                onUpdateHomeProfile={setHomeProfile}
              />
            )}

            {activeNav === 'sustainability' && (
              <SustainableLivingView
                goals={sustainabilityGoals}
                snapshot={activeSnapshot}
                prefs={prefs}
                homeProfile={homeProfile}
                geminiConfigured={geminiConfigured}
                onUpdateGoals={setSustainabilityGoals}
                onResetGoals={() => setSustainabilityGoals(INITIAL_SUSTAINABILITY_GOALS)}
              />
            )}

            {activeNav === 'exposure' && (
              <ExposureTrackerView
                snapshot={activeSnapshot}
                aqiStandard={prefs.aqiStandard}
                logs={exposureLogs}
                onAddLog={(entry) => setExposureLogs((prev) => [entry, ...prev])}
                onDeleteLog={(id) =>
                  setExposureLogs((prev) => prev.filter((item) => item.id !== id))
                }
                onClearAllLogs={() => setExposureLogs([])}
              />
            )}

            {activeNav === 'assistant' && (
              <AssistantView
                snapshot={activeSnapshot}
                prefs={prefs}
                homeProfile={homeProfile}
                sustainabilityGoals={sustainabilityGoals}
                exposureLogs={exposureLogs}
                geminiConfigured={geminiConfigured}
                messages={chatMessages}
                onUpdateMessages={setChatMessages}
              />
            )}

            {activeNav === 'family' && (
              <FamilyProtectionView
                snapshot={activeSnapshot}
                prefs={prefs}
                homeProfile={homeProfile}
                sustainabilityGoals={sustainabilityGoals}
                geminiConfigured={geminiConfigured}
                onUpdatePrefs={setPrefs}
              />
            )}

            {activeNav === 'commute' && (
              <CommuteAssistantView
                snapshot={activeSnapshot}
                aqiStandard={prefs.aqiStandard}
                prefs={prefs}
                homeProfile={homeProfile}
                geminiConfigured={geminiConfigured}
              />
            )}

            {activeNav === 'community' && (
              <CommunityActionView
                initiatives={communityInitiatives}
                cityName={activeSnapshot?.location.name ?? 'Your Area'}
                onUpdateInitiatives={setCommunityInitiatives}
              />
            )}

            {activeNav === 'education' && <EducationCenterView />}

            {activeNav === 'notifications' && (
              <NotificationsView
                notifications={notifications}
                prefs={prefs}
                onUpdatePrefs={setPrefs}
                onMarkAllRead={() =>
                  setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
                }
                onClearNotifications={() => setNotifications([])}
              />
            )}

            {activeNav === 'settings' && (
              <SettingsView
                prefs={prefs}
                onUpdatePrefs={setPrefs}
                onClearChat={() => setChatMessages([])}
                onClearLogs={() => setExposureLogs([])}
                onResetAll={handleResetAllData}
                onReplayOnboarding={() =>
                  setPrefs((p) => ({ ...p, onboardingCompleted: false }))
                }
                onExportAllData={handleExportAllData}
              />
            )}
          </Suspense>
        </ErrorBoundary>
      </AppShell>

      <LocationSelectorModal
        isOpen={locationModalOpen}
        onClose={() => setLocationModalOpen(false)}
        currentLocation={activeSnapshot?.location ?? null}
        favorites={favorites}
        recent={recentLocs}
        onSelectLiveLocation={handleSelectLiveLocation}
        onSelectDemoScenario={handleSelectDemoScenario}
        onToggleFavorite={handleToggleFavorite}
      />
    </>
  );
}
