import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Menu, X } from 'lucide-react';
import {
  CORE_NAV_ITEMS,
  MOBILE_QUICK_NAV,
  SECONDARY_NAV_ITEMS,
} from '../config/appConfig.ts';
import type { AirQualitySnapshot, NavSection, UserPreferences } from '../types/airQuality.ts';
import { getActiveAqiValue, getAqiCategory } from '../utils/aqi.ts';

interface AppShellProps {
  activeNav: NavSection;
  onSelectNav: (nav: NavSection) => void;
  prefs: UserPreferences;
  activeSnapshot: AirQualitySnapshot | null;
  unreadAlerts: number;
  hasSelectedLiveLoc: boolean;
  onOpenLocationModal: () => void;
  onSwitchToLive: () => void;
  onSwitchToDemo: () => void;
  onChangeAqiStandard: (standard: UserPreferences['aqiStandard']) => void;
  children: ReactNode;
}

export function AppShell({
  activeNav,
  onSelectNav,
  prefs,
  activeSnapshot,
  unreadAlerts,
  hasSelectedLiveLoc,
  onOpenLocationModal,
  onSwitchToLive,
  onSwitchToDemo,
  onChangeAqiStandard,
  children,
}: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const mobileDrawerCloseRef = useRef<HTMLButtonElement | null>(null);

  const closeMobileMenu = useCallback(() => {
    setMobileMenuOpen(false);
    requestAnimationFrame(() => {
      mobileMenuTriggerRef.current?.focus();
    });
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    mobileDrawerCloseRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeMobileMenu();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileMenuOpen, closeMobileMenu]);

  const activeAqi = activeSnapshot
    ? getActiveAqiValue(activeSnapshot, prefs.aqiStandard)
    : null;
  const activeCat = getAqiCategory(activeAqi, prefs.aqiStandard);
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
            onClick={() => onSelectNav('dashboard')}
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
                      onClick={() => onSelectNav(item.id)}
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
                      onClick={() => onSelectNav(item.id)}
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
                      onSelectNav(item.id);
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
              onClick={onOpenLocationModal}
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
                  if (hasSelectedLiveLoc) {
                    onSwitchToLive();
                  } else {
                    onOpenLocationModal();
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
                onClick={onSwitchToDemo}
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
                onClick={() => onChangeAqiStandard('us_aqi')}
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
                onClick={() => onChangeAqiStandard('eaqi')}
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
          {children}
        </main>
      </div>

      {/* Compact Mobile Bottom Tab Bar (56px, keeps total sticky mobile <= 15%) */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-20 bg-white border-t border-slate-200 h-14 grid grid-cols-5"
        aria-label="Mobile Quick Navigation"
      >
        {MOBILE_QUICK_NAV.map(({ id, label, icon: Icon }) => {
          const active = activeNav === id;
          return (
            <button
              key={id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => onSelectNav(id)}
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
    </div>
  );
}
