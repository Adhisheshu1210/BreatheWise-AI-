import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Bell,
  BookOpen,
  CalendarClock,
  Home,
  LayoutDashboard,
  Leaf,
  Map as MapIcon,
  Menu,
  MessageSquare,
  Navigation,
  Settings,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { LocationSelectorModal } from './components/LocationSelectorModal.tsx';
import { OnboardingFlow } from './components/OnboardingFlow.tsx';
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
import {
  NotificationsView,
  SettingsView,
} from './features/NotificationsAndSettingsView.tsx';
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
  getActiveAqiValue,
  getAqiCategory,
  isWithinQuietHours,
} from './utils/aqi.ts';

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

const DEFAULT_PREFS: UserPreferences = {
  onboardingCompleted: false,
  priorities: ['Protect my family', 'Improve home air'],
  lifestyleRole: 'general',
  aqiStandard: 'us_aqi',
  tempUnit: 'C',
  demoMode: true,
  schedule: {
    wakeTime: '07:00',
    bedTime: '22:30',
    workStart: '08:30',
    workEnd: '17:30',
    commuteMode: 'public_transit',
    preferredExercise: 'walking',
    outdoorGoals: 'Reduce commute exposure and maintain indoor fitness',
  },
  household: [],
  budgetTier: '2000',
  accessibility: {
    highContrast: false,
    largeText: false,
    reducedMotion: false,
  },
  notifications: {
    aqiThreshold: 120,
    quietStart: '22:00',
    quietEnd: '06:30',
    enableInAppAlerts: true,
    dailySummary: true,
    indoorTips: true,
  },
};

const CORE_NAV_ITEMS: Array<{ id: NavSection; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'map', label: 'Air Quality Map', icon: MapIcon },
  { id: 'planner', label: 'Daily Planner', icon: CalendarClock },
  { id: 'indoor', label: 'Home Air Care', icon: Home },
  { id: 'sustainability', label: 'Sustainable Living', icon: Leaf },
  { id: 'exposure', label: 'Exposure Tracker', icon: Activity },
  { id: 'assistant', label: 'AI Assistant', icon: MessageSquare },
];

const SECONDARY_NAV_ITEMS: Array<{ id: NavSection; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'family', label: 'Protect My Family', icon: ShieldCheck },
  { id: 'commute', label: 'Commute Assistant', icon: Navigation },
  { id: 'community', label: 'Community Action', icon: Users },
  { id: 'education', label: 'Learning Center', icon: BookOpen },
  { id: 'notifications', label: 'Alerts', icon: Bell },
  { id: 'settings', label: 'Settings', icon: Settings },
];

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [locationModalOpen, setLocationModalOpen] = useState(false);

  const [liveSnapshot, setLiveSnapshot] = useState<AirQualitySnapshot | null>(null);
  const [loadingAqi, setLoadingAqi] = useState(false);
  const [aqiError, setAqiError] = useState<string | null>(null);
  const [geminiConfigured, setGeminiConfigured] = useState(false);

  const liveFetchControllerRef = useRef<AbortController | null>(null);
  const liveRequestSeqRef = useRef(0);
  const mobileMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const mobileDrawerCloseRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    fetchServerHealth()
      .then((h) => setGeminiConfigured(Boolean(h.geminiConfigured)))
      .catch(() => setGeminiConfigured(false));
    return () => {
      liveFetchControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    mobileDrawerCloseRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
        mobileMenuTriggerRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileMenuOpen]);

  const closeMobileMenu = useCallback(() => {
    setMobileMenuOpen(false);
    requestAnimationFrame(() => {
      mobileMenuTriggerRef.current?.focus();
    });
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
    if (typeof URL.createObjectURL !== 'function') return false;
    const payload = {
      exportedAt: new Date().toISOString(),
      preferences: prefs,
      favorites,
      homeProfile,
      dailyPlan: effectiveDailyPlan,
      exposureLogs,
      sustainabilityGoals,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `breathewise-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return true;
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

  const activeAqi = activeSnapshot
    ? getActiveAqiValue(activeSnapshot, prefs.aqiStandard)
    : null;
  const activeCat = getAqiCategory(activeAqi, prefs.aqiStandard);
  const unreadAlerts = notifications.filter((n) => !n.read).length;

  const activeSectionLabel =
    [...CORE_NAV_ITEMS, ...SECONDARY_NAV_ITEMS].find((i) => i.id === activeNav)?.label ??
    'Dashboard';

  const rootAccessibilityClasses = [
    prefs.accessibility.highContrast ? 'a11y-high-contrast' : '',
    prefs.accessibility.largeText ? 'a11y-large-text' : '',
    prefs.accessibility.reducedMotion ? 'a11y-reduced-motion' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`min-h-screen bg-[#F8FAFC] text-[#0F172A] flex ${rootAccessibilityClasses}`}>
      {/* WCAG 2.2 Bypass Blocks: Skip to main content link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2.5 focus:bg-slate-900 focus:text-white focus:text-xs focus:font-semibold focus:rounded-lg focus:shadow-lg"
      >
        Skip to main content
      </a>

      {/* Desktop Sidebar Navigation */}
      <aside
        className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-[#0F172A] text-slate-200 border-r border-slate-800 z-30"
        aria-label="Primary Navigation"
      >
        <div className="px-5 py-5 border-b border-slate-800">
          <button
            type="button"
            onClick={() => setActiveNav('dashboard')}
            className="text-left text-lg font-display font-bold tracking-tight text-white whitespace-nowrap rounded"
          >
            BreatheWise AI
          </button>
          <p className="text-[11px] text-slate-300 mt-0.5 truncate">
            Environmental Health Assistant
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6" aria-label="Workspace Sections">
          <div>
            <div className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-300">
              Core Workspace
            </div>
            <ul className="space-y-1">
              {CORE_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeNav === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setActiveNav(item.id)}
                      aria-current={active ? 'page' : undefined}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-teal-600/25 text-teal-200 font-semibold'
                          : 'text-slate-200 hover:bg-slate-800/80 hover:text-white'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <div className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-300">
              Protection & Learning
            </div>
            <ul className="space-y-1">
              {SECONDARY_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeNav === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setActiveNav(item.id)}
                      aria-current={active ? 'page' : undefined}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-teal-600/25 text-teal-200 font-semibold'
                          : 'text-slate-200 hover:bg-slate-800/80 hover:text-white'
                      }`}
                    >
                      <span className="flex items-center gap-3 min-w-0">
                        <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">{item.label}</span>
                      </span>
                      {item.id === 'notifications' && unreadAlerts > 0 && (
                        <span
                          className="font-mono text-[11px] font-semibold text-teal-200 px-1.5 py-0.5 rounded bg-slate-800"
                          aria-label={`${unreadAlerts} unread alerts`}
                        >
                          {unreadAlerts}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>

        <div className="p-4 border-t border-slate-800 text-xs">
          <div className="text-slate-300">Active Scale & Mode</div>
          <div className="mt-1.5 flex items-center justify-between text-white font-medium">
            <span>{prefs.aqiStandard === 'eaqi' ? 'European EAQI' : 'US EPA AQI'}</span>
            <span>{prefs.demoMode ? 'Demo Mode' : 'Live Feed'}</span>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          <div
            className="fixed inset-0 bg-slate-950/55"
            aria-hidden="true"
            onClick={closeMobileMenu}
          />
          <div className="relative w-72 max-w-[82vw] bg-[#0F172A] text-slate-100 h-full flex flex-col p-4 overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <span className="text-base font-display font-bold text-white">BreatheWise AI</span>
              <button
                ref={mobileDrawerCloseRef}
                type="button"
                onClick={closeMobileMenu}
                aria-label="Close navigation menu"
                className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-200 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
            <div className="py-4 space-y-1 flex-1">
              {[...CORE_NAV_ITEMS, ...SECONDARY_NAV_ITEMS].map((item) => {
                const Icon = item.icon;
                const active = activeNav === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => {
                      setActiveNav(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-3 min-h-[44px] text-sm font-medium rounded-lg ${
                      active
                        ? 'bg-teal-600/25 text-teal-200 font-semibold'
                        : 'text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="w-4 h-4" aria-hidden="true" />
                      {item.label}
                    </span>
                    {item.id === 'notifications' && unreadAlerts > 0 && (
                      <span className="font-mono text-xs text-teal-200">{unreadAlerts}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Clean Top Bar */}
        <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              ref={mobileMenuTriggerRef}
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={mobileMenuOpen}
              className="lg:hidden p-2 -ml-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-700 hover:bg-slate-100 rounded-lg"
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="font-semibold text-slate-900 truncate">{activeSectionLabel}</span>
              {activeSnapshot && (
                <>
                  <span className="text-slate-500 hidden sm:inline" aria-hidden="true">
                    /
                  </span>
                  <span className="text-xs text-slate-600 truncate hidden sm:inline">
                    {activeSnapshot.location.name} ·{' '}
                    <span className="font-mono tabular-nums font-semibold text-slate-900">
                      {activeAqi ?? '—'}
                    </span>{' '}
                    ({activeCat.shortLabel})
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setLocationModalOpen(true)}
              className="px-3.5 py-2 min-h-[38px] text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg whitespace-nowrap shrink-0"
            >
              {activeSnapshot ? 'Select City' : 'Choose Location'}
            </button>
          </div>
        </header>

        {/* Secondary Workspace Control Bar (non-sticky) */}
        <div className="px-4 sm:px-6 pt-4 pb-1 flex flex-wrap items-center justify-between gap-3 max-w-[1360px] w-full mx-auto">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span>
              Mode:{' '}
              <strong className="text-slate-900">
                {prefs.demoMode ? 'Demo Simulation' : 'Live Open-Meteo Feed'}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Scale:{' '}
              <strong className="text-slate-900">
                {prefs.aqiStandard === 'eaqi' ? 'EAQI' : 'US EPA AQI'}
              </strong>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex p-0.5 bg-slate-200/80 rounded-lg"
              role="group"
              aria-label="Data mode"
            >
              <button
                type="button"
                aria-pressed={!prefs.demoMode}
                onClick={() => {
                  if (selectedLiveLoc) {
                    setPrefs((p) => ({ ...p, demoMode: false }));
                  } else {
                    setLocationModalOpen(true);
                  }
                }}
                className={`px-3 py-1.5 min-h-[34px] text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                  !prefs.demoMode
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                Live City
              </button>
              <button
                type="button"
                aria-pressed={prefs.demoMode}
                onClick={() => {
                  setPrefs((p) => ({ ...p, demoMode: true }));
                  setAqiError(null);
                }}
                className={`px-3 py-1.5 min-h-[34px] text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                  prefs.demoMode
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                Demo Mode
              </button>
            </div>

            <div
              className="inline-flex p-0.5 bg-slate-200/80 rounded-lg"
              role="group"
              aria-label="AQI scale"
            >
              <button
                type="button"
                aria-pressed={prefs.aqiStandard === 'us_aqi'}
                onClick={() => setPrefs((p) => ({ ...p, aqiStandard: 'us_aqi' }))}
                className={`px-3 py-1.5 min-h-[34px] text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                  prefs.aqiStandard === 'us_aqi'
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                US AQI
              </button>
              <button
                type="button"
                aria-pressed={prefs.aqiStandard === 'eaqi'}
                onClick={() => setPrefs((p) => ({ ...p, aqiStandard: 'eaqi' }))}
                className={`px-3 py-1.5 min-h-[34px] text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                  prefs.aqiStandard === 'eaqi'
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                EAQI
              </button>
            </div>
          </div>
        </div>

        {/* Main Viewport */}
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 px-4 sm:px-6 py-4 pb-20 lg:pb-10 max-w-[1360px] w-full mx-auto focus:outline-none"
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
        </main>
      </div>

      {/* Compact Mobile Bottom Tab Bar (56px, keeps total sticky mobile <= 15%) */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-20 bg-white border-t border-slate-200 h-14 grid grid-cols-5"
        aria-label="Mobile Quick Navigation"
      >
        {(
          [
            ['dashboard', 'Home', LayoutDashboard],
            ['planner', 'Planner', CalendarClock],
            ['indoor', 'Air Care', Home],
            ['exposure', 'Tracker', Activity],
            ['assistant', 'AI Chat', MessageSquare],
          ] as const
        ).map(([id, label, Icon]) => {
          const active = activeNav === id;
          return (
            <button
              key={id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => setActiveNav(id)}
              className={`relative flex flex-col items-center justify-center gap-0.5 text-[11px] transition-colors ${
                active
                  ? 'text-teal-800 font-semibold'
                  : 'text-slate-600 font-medium hover:text-slate-900'
              }`}
            >
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 inset-x-3 h-0.5 bg-teal-700 rounded-b"
                />
              )}
              <Icon className="w-4 h-4" aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

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
    </div>
  );
}
