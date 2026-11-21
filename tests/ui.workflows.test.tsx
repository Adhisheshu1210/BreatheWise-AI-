// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App.tsx';
import { DEMO_SCENARIOS } from '../src/data/demoData.ts';
import { clearAiResponseCache } from '../src/services/apiClient.ts';

function seedCompletedOnboarding(overrides: Record<string, unknown> = {}) {
  window.localStorage.setItem(
    'bw_prefs_v1',
    JSON.stringify({
      onboardingCompleted: true,
      priorities: ['Protect my family'],
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
        outdoorGoals: 'Reduce commute exposure',
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
      ...overrides,
    })
  );
}

describe('BreatheWise AI UI Workflows, Navigation, Forms, Settings & Persistence', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    window.localStorage.clear();
    clearAiResponseCache();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/health')) {
        return new Response(
          JSON.stringify({ ok: true, provider: 'Open-Meteo', geminiConfigured: true }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ error: 'NOT_MOCKED', message: 'Not mocked' }), {
        status: 500,
      });
    });
  });

  afterEach(() => {
    cleanup();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    window.localStorage.clear();
    clearAiResponseCache();
  });

  it('completes onboarding skip flow and navigates cleanly across core & lazy routes without errors', async () => {
    render(<App />);

    // First-time user sees OnboardingFlow
    expect(screen.getByRole('button', { name: /Skip setup/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Skip setup/i }));

    // Dashboard loads immediately with Demo Mode banner & AQI
    expect(await screen.findByText(/DEMO DATA:/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Pollutant Breakdown/i })).toBeInTheDocument();

    // Navigate to lazy-loaded Air Quality Map
    fireEvent.click(screen.getByRole('button', { name: 'Air Quality Map' }));
    expect(
      await screen.findByRole('heading', { name: /Regional Air Quality Spatial Grid/i })
    ).toBeInTheDocument();

    // Navigate to lazy-loaded Commute Assistant & verify form validation
    fireEvent.click(screen.getByRole('button', { name: 'Commute Assistant' }));
    expect(
      await screen.findByRole('heading', { name: /Smart Route & Commute Assistant/i })
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Starting Point/i), { target: { value: '' } });
    expect(screen.getByRole('alert')).toHaveTextContent(/Enter both a starting point/i);

    // Navigate to lazy-loaded Community Action & validate form errors + creation
    fireEvent.click(screen.getByRole('button', { name: 'Community Action' }));
    expect(
      await screen.findByRole('heading', { name: /Community Clean-Air Action Center/i })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Create Initiative/i }));
    expect(screen.getByText(/at least 3 characters/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Initiative Title/i), {
      target: { value: 'School No-Idling Walk' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Create Initiative/i }));
    expect(screen.getByText('School No-Idling Walk')).toBeInTheDocument();

    // Navigate to lazy-loaded Learning Center
    fireEvent.click(screen.getByRole('button', { name: 'Learning Center' }));
    expect(
      await screen.findByRole('heading', { name: /Air Quality Learning Center/i })
    ).toBeInTheDocument();

    // Mobile drawer navigation open & close
    fireEvent.click(screen.getByRole('button', { name: /Open navigation menu/i }));
    const drawer = screen.getByRole('dialog', { name: /Navigation menu/i });
    fireEvent.click(within(drawer).getByRole('button', { name: /Daily Planner/i }));
    expect(
      await screen.findByRole('heading', { name: /Smart Daily Air Quality & Activity Planner/i })
    ).toBeInTheDocument();
  });

  it('handles missing location state, LocationSelectorModal search, errors, manual coordinates & live fetch', async () => {
    seedCompletedOnboarding({ demoMode: false });

    const liveSnap = {
      ...DEMO_SCENARIOS[3].snapshot,
      isDemo: false,
      dataSource: 'Open-Meteo Air Quality',
      freshnessStatus: 'fresh',
      freshnessLabel: 'Just updated',
      location: {
        id: 'om-london',
        name: 'London',
        country: 'United Kingdom',
        latitude: 51.5,
        longitude: -0.12,
      },
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/health')) {
        return new Response(
          JSON.stringify({ ok: true, provider: 'Open-Meteo', geminiConfigured: true }),
          { status: 200 }
        );
      }
      if (url.includes('/api/location/search?q=London')) {
        return new Response(
          JSON.stringify({
            results: [liveSnap.location],
          }),
          { status: 200 }
        );
      }
      if (url.includes('/api/location/search?q=FailCity')) {
        return new Response(
          JSON.stringify({ error: 'RATE_LIMITED', message: 'Provider rate limit reached.' }),
          { status: 429 }
        );
      }
      if (url.includes('/api/air-quality')) {
        return new Response(JSON.stringify({ snapshot: liveSnap }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });

    render(<App />);

    // Missing location state renders empty prompt instead of crashing
    expect(
      await screen.findByRole('heading', { name: /Select a Location to Begin/i })
    ).toBeInTheDocument();

    // Commute Assistant also discloses missing city AQI instead of fabricating a default number
    fireEvent.click(screen.getByRole('button', { name: 'Commute Assistant' }));
    expect(
      await screen.findByText(/unavailable city AQI \(no location selected\)/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/current city AQI \(95\)/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));

    // Open location modal
    fireEvent.click(await screen.findByRole('button', { name: /Search City or Choose Demo/i }));
    const searchInput = screen.getByLabelText(/Search city or neighborhood/i);

    // 1 char prompt
    fireEvent.change(searchInput, { target: { value: 'L' } });
    expect(screen.getByText(/Type at least 2 characters/i)).toBeInTheDocument();

    // API failure in search displays alert
    fireEvent.change(searchInput, { target: { value: 'FailCity' } });
    expect(await screen.findByText(/Provider rate limit reached/i)).toBeInTheDocument();

    // Invalid manual coordinates trigger inline validation error
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '999' } });
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /Load Coordinates/i }));
    expect(screen.getByText(/Enter valid coordinates/i)).toBeInTheDocument();

    // Valid search & selection loads live snapshot from geocoding search results list
    fireEvent.change(searchInput, { target: { value: 'London' } });
    const searchResultsList = await screen.findByRole('list', { name: /City search results/i });
    fireEvent.click(
      within(searchResultsList).getByRole('button', { name: /London.*United Kingdom/i })
    );

    await waitFor(() => {
      expect(screen.getByText(/Live Open-Meteo Feed/i)).toBeInTheDocument();
      expect(screen.getAllByText(/London/).length).toBeGreaterThan(0);
    });
  });

  it('validates exposure logs, saves/deletes/clears entries, and persists across reload', async () => {
    seedCompletedOnboarding();
    const { unmount } = render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Exposure Tracker' }));
    expect(
      await screen.findByRole('heading', { name: /Personal Exposure Awareness Tracker/i })
    ).toBeInTheDocument();

    // Invalid duration > 720
    fireEvent.change(screen.getByLabelText(/Duration \(min\)/i), { target: { value: '900' } });
    fireEvent.click(screen.getByRole('button', { name: /Add Exposure Log/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/between 1 and 720 minutes/i);

    // Valid submission
    fireEvent.change(screen.getByLabelText(/Duration \(min\)/i), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText(/^Activity$/i), { target: { value: 'Park Jog' } });
    fireEvent.change(screen.getByLabelText(/Approx\. AQI/i), { target: { value: '165' } });
    fireEvent.click(screen.getByRole('button', { name: /Add Exposure Log/i }));

    expect(screen.getByRole('status')).toHaveTextContent(/Outdoor session added/i);
    expect(screen.getByRole('button', { name: /Delete Park Jog log entry/i })).toBeInTheDocument();

    // Verify persisted to localStorage across remount
    unmount();
    const savedLogs = JSON.parse(window.localStorage.getItem('bw_exposure_logs_v1') || '[]') as Array<{
      activity: string;
    }>;
    expect(savedLogs.some((l) => l.activity === 'Park Jog')).toBe(true);

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Exposure Tracker' }));
    const deleteBtn = await screen.findByRole('button', { name: /Delete Park Jog log entry/i });
    fireEvent.click(deleteBtn);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Delete Park Jog log entry/i })).not.toBeInTheDocument();
    });

    // Clear all logs workflow
    fireEvent.click(screen.getByRole('button', { name: /Delete All Logs/i }));
    fireEvent.click(screen.getByRole('button', { name: /Confirm Delete/i }));
    expect(screen.getByText(/No Exposure Logs Yet/i)).toBeInTheDocument();
  });

  it('validates sustainability goals, increments score, and supports daily planner, family & indoor workflows', async () => {
    seedCompletedOnboarding();
    render(<App />);

    // Sustainability Living
    fireEvent.click(screen.getByRole('button', { name: 'Sustainable Living' }));
    expect(
      await screen.findByRole('heading', { name: /Sustainable Living & Impact/i })
    ).toBeInTheDocument();

    // Short goal rejected
    fireEvent.change(screen.getByLabelText(/Create Custom Goal/i), { target: { value: 'ab' } });
    fireEvent.click(screen.getByRole('button', { name: /Add Goal/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/at least 3 characters/i);

    // Valid goal added & logged
    fireEvent.change(screen.getByLabelText(/Create Custom Goal/i), {
      target: { value: 'Solar Drying Week' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Add Goal/i }));
    expect(screen.getByText('Solar Drying Week')).toBeInTheDocument();
    const logButtons = screen.getAllByRole('button', { name: /Log Action/i });
    fireEvent.click(logButtons[0]);

    // Family Protection: add member, remove member, refresh demo plan
    fireEvent.click(screen.getByRole('button', { name: 'Protect My Family' }));
    expect(await screen.findByRole('heading', { name: /Protect My Family/i })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Display Label/i), { target: { value: 'Leo' } });
    fireEvent.click(screen.getByRole('button', { name: /Add to Household/i }));
    expect(screen.getAllByText('Leo').length).toBeGreaterThanOrEqual(2);
    fireEvent.click(screen.getByRole('button', { name: /Refresh Household Plan/i }));
    expect(screen.getByText(/Household Summary:/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Remove Leo/i }));
    expect(screen.queryByRole('button', { name: /Remove Leo/i })).not.toBeInTheDocument();

    // Home Air Care: update budget tier + checklist + demo budget upgrade
    fireEvent.click(screen.getByRole('button', { name: 'Home Air Care' }));
    expect(
      await screen.findByRole('heading', { name: /AI Indoor Air Care Assistant/i })
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Budget Tier/i), { target: { value: '500' } });
    expect(screen.getByText(/Selected tier/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Tailor Budget Upgrades/i }));
    expect(screen.getByText(/Prioritized Strategy \(Under ₹500\)/i)).toBeInTheDocument();

    // Daily Planner: toggle, edit & save
    fireEvent.click(screen.getByRole('button', { name: 'Daily Planner' }));
    const checkboxes = await screen.findAllByRole('checkbox');
    expect(checkboxes[0]).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(checkboxes[0]);
    expect(checkboxes[0]).toHaveAttribute('aria-checked', 'true');

    const editBtns = screen.getAllByRole('button', { name: /^Edit$/i });
    fireEvent.click(editBtns[0]);
    fireEvent.change(screen.getByLabelText(/Edit activity title/i), {
      target: { value: 'Custom Morning Check' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));
    expect(screen.getByText('Custom Morning Check')).toBeInTheDocument();
  });

  it('surfaces Gemini API errors & invalid AI responses safely without fake guidance or crashes', async () => {
    seedCompletedOnboarding({ demoMode: false });

    const liveSnap = {
      ...DEMO_SCENARIOS[0].snapshot,
      isDemo: false,
      location: {
        id: 'om-del',
        name: 'Delhi',
        country: 'India',
        latitude: 28.61,
        longitude: 77.21,
      },
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/health')) {
        return new Response(
          JSON.stringify({ ok: true, provider: 'Open-Meteo', geminiConfigured: true }),
          { status: 200 }
        );
      }
      if (url.includes('/api/air-quality')) {
        return new Response(JSON.stringify({ snapshot: liveSnap }), { status: 200 });
      }
      if (url.includes('/api/ai/recommend')) {
        return new Response(
          JSON.stringify({
            error: 'AI_INVALID_RESPONSE',
            message: 'Daily plan response was malformed.',
          }),
          { status: 502 }
        );
      }
      if (url.includes('/api/ai/chat')) {
        return new Response(
          JSON.stringify({
            error: 'API_KEY_MISSING',
            message: 'Gemini API key is not configured on the server.',
          }),
          { status: 503 }
        );
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });

    // Seed selected live location
    window.localStorage.setItem('bw_selected_live_loc_v1', JSON.stringify(liveSnap.location));
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Priority Schedule Actions/i)).toBeInTheDocument();
    });

    // Daily Planner live Gemini failure displays explicit AiErrorBanner
    fireEvent.click(screen.getByRole('button', { name: 'Daily Planner' }));
    fireEvent.click(await screen.findByRole('button', { name: /Generate AI Plan \(Gemini\)/i }));
    expect(await screen.findByText(/Daily plan response was malformed/i)).toBeInTheDocument();

    // AI Assistant missing key displays explicit error message + retry button
    fireEvent.click(screen.getByRole('button', { name: 'AI Assistant' }));
    const chatInput = await screen.findByLabelText(/Message BreatheWise AI Assistant/i);
    fireEvent.change(chatInput, { target: { value: 'Can I walk outside?' } });
    fireEvent.click(screen.getByRole('button', { name: /Send/i }));
    expect(
      await screen.findByText(/Gemini API key is not configured on the server/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry Last Message/i })).toBeInTheDocument();
  });

  it('persists Settings changes, recovers gracefully from corrupted localStorage, and resets full app data', async () => {
    // Seed corrupted JSON into localStorage before mount
    window.localStorage.setItem('bw_prefs_v1', '{corrupt json!!!');
    window.localStorage.setItem('bw_exposure_logs_v1', 'not-an-array');

    const { unmount } = render(<App />);
    // Corrupt bw_prefs_v1 falls back to DEFAULT_PREFS (onboardingCompleted: false) cleanly without crashing
    expect(screen.getByRole('button', { name: /Skip setup/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Skip setup/i }));

    // Open Settings and change scale, temp unit, accessibility
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(
      await screen.findByRole('heading', { name: /Personalization, Privacy & Settings/i })
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/AQI Standard/i), { target: { value: 'eaqi' } });
    fireEvent.click(screen.getByRole('button', { name: '°F' }));
    fireEvent.click(screen.getByLabelText(/Enhanced visual contrast mode/i));

    await waitFor(() => {
      const persisted = JSON.parse(window.localStorage.getItem('bw_prefs_v1') || '{}');
      expect(persisted.aqiStandard).toBe('eaqi');
      expect(persisted.tempUnit).toBe('F');
      expect(persisted.accessibility?.highContrast).toBe(true);
    });

    // Remount to prove persistence works
    unmount();
    render(<App />);
    expect(screen.getAllByText(/European EAQI/i).length).toBeGreaterThan(0);

    // Full reset clears customized settings back to defaults
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(await screen.findByRole('button', { name: /Reset Application Data/i }));
    fireEvent.click(screen.getByRole('button', { name: /Confirm Full Reset/i }));
    expect(
      screen.getByText(/All application preferences and local records reset/i)
    ).toBeInTheDocument();
    expect(screen.getAllByText(/US EPA AQI/i).length).toBeGreaterThan(0);
  });
});
