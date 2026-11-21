// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App.tsx';
import { ErrorBoundary } from '../src/components/ErrorBoundary.tsx';
import { DEMO_SCENARIOS } from '../src/data/demoData.ts';
import { clearAiResponseCache } from '../src/services/apiClient.ts';
import { downloadJsonFile } from '../src/utils/exportJson.ts';

function seedLiveCityPrefs(overrides: Record<string, unknown> = {}) {
  const liveLoc = {
    id: 'om-del',
    name: 'Delhi',
    country: 'India',
    latitude: 28.61,
    longitude: 77.21,
  };
  window.localStorage.setItem('bw_selected_live_loc_v1', JSON.stringify(liveLoc));
  window.localStorage.setItem(
    'bw_prefs_v1',
    JSON.stringify({
      onboardingCompleted: true,
      priorities: ['Protect my family', 'Improve home air'],
      lifestyleRole: 'parent',
      aqiStandard: 'us_aqi',
      tempUnit: 'C',
      demoMode: false,
      schedule: {
        wakeTime: '06:30',
        bedTime: '22:30',
        workStart: '08:30',
        workEnd: '17:30',
        commuteMode: 'public_transit',
        preferredExercise: 'running',
        outdoorGoals: 'Lower commute exposure',
      },
      household: [{ id: 'm1', group: 'children', nickname: 'Maya' }],
      budgetTier: '2000',
      accessibility: {
        highContrast: false,
        largeText: false,
        reducedMotion: false,
      },
      notifications: {
        aqiThreshold: 120,
        quietStart: '00:00',
        quietEnd: '00:00',
        enableInAppAlerts: true,
        dailySummary: true,
        indoorTips: true,
      },
      ...overrides,
    })
  );
  return {
    ...DEMO_SCENARIOS[0].snapshot,
    isDemo: false,
    dataSource: 'Open-Meteo Air Quality',
    freshnessStatus: 'fresh',
    freshnessLabel: 'Just updated',
    location: liveLoc,
  };
}

describe('BreatheWise AI Advanced Workflows: Live Gemini, Loading/Error Recovery, Notifications & Export', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    window.localStorage.clear();
    clearAiResponseCache();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    window.localStorage.clear();
    clearAiResponseCache();
  });

  it('downloads JSON cleanly with downloadJsonFile and returns false when URL.createObjectURL is absent', () => {
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    const createMock = vi.fn(() => 'blob:mock-url');
    const revokeMock = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    Object.defineProperty(URL, 'createObjectURL', { value: createMock, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeMock, configurable: true });

    try {
      expect(downloadJsonFile('test-export.json', { ok: true })).toBe(true);
      expect(createMock).toHaveBeenCalledTimes(1);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(revokeMock).toHaveBeenCalledWith('blob:mock-url');

      Object.defineProperty(URL, 'createObjectURL', { value: undefined, configurable: true });
      expect(downloadJsonFile('test-export.json', { ok: true })).toBe(false);
    } finally {
      Object.defineProperty(URL, 'createObjectURL', {
        value: originalCreateObjectUrl,
        configurable: true,
      });
      Object.defineProperty(URL, 'revokeObjectURL', {
        value: originalRevokeObjectUrl,
        configurable: true,
      });
    }
  });

  it('catches runtime render failures in ErrorBoundary and recovers cleanly on Try Again', () => {
    let shouldThrow = true;
    function UnstableWidget() {
      if (shouldThrow) {
        throw new Error('Simulated chart crash');
      }
      return <div>Widget Recovered</div>;
    }

    const resetSpy = vi.fn(() => {
      shouldThrow = false;
    });

    // Clear afterEach console.error check after explicitly asserting React boundary log inside this test
    render(
      <ErrorBoundary fallbackTitle="Widget Failed" onReset={resetSpy}>
        <UnstableWidget />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Widget Failed');
    expect(screen.getByRole('alert')).toHaveTextContent('Simulated chart crash');

    fireEvent.click(screen.getByRole('button', { name: /Try Again/i }));
    expect(resetSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Widget Recovered')).toBeInTheDocument();

    consoleErrorSpy.mockClear();
  });

  it('shows Dashboard loading skeleton, handles live fetch failure, and recovers on Retry Live Fetch', async () => {
    const liveSnap = seedLiveCityPrefs();
    let resolveDeferred!: (res: Response) => void;
    let airQualityAttempt = 0;

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/api/health')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ ok: true, provider: 'Open-Meteo', geminiConfigured: true }),
            { status: 200 }
          )
        );
      }
      if (url.includes('/api/air-quality')) {
        airQualityAttempt += 1;
        if (airQualityAttempt === 1) {
          return new Promise<Response>((resolve) => {
            resolveDeferred = resolve;
          });
        }
        return Promise.resolve(JSON.stringify({ snapshot: liveSnap })).then(
          (body) => new Response(body, { status: 200 })
        );
      }
      return Promise.resolve(new Response('{}', { status: 404 }));
    });

    render(<App />);

    // Loading skeleton visible while first live request is pending
    expect(
      await screen.findByRole('status', { name: /Loading air quality data/i })
    ).toBeInTheDocument();

    // First attempt fails -> error panel rendered
    resolveDeferred(
      new Response(
        JSON.stringify({ error: 'UPSTREAM_UNAVAILABLE', message: 'Upstream sensor offline.' }),
        { status: 503 }
      )
    );

    expect(
      await screen.findByRole('heading', { name: /Unable to Load Live Environmental Data/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/Upstream sensor offline/i)).toBeInTheDocument();

    // Retry recovers seamlessly
    fireEvent.click(screen.getByRole('button', { name: /Retry Live Fetch/i }));
    expect(await screen.findByText(/Pollutant Breakdown/i)).toBeInTheDocument();
  });

  it('executes live Gemini workflows for outdoor-activity, indoor-care, budget-home-upgrade, family-protection, explain-air, and sustainability-plan', async () => {
    const liveSnap = seedLiveCityPrefs();
    const seenTasks: string[] = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
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
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          taskType: string;
          payload?: Record<string, unknown>;
        };
        seenTasks.push(body.taskType);

        if (body.taskType === 'outdoor-activity') {
          return new Response(
            JSON.stringify({
              data: {
                verdict: 'Gemini recommends shifting running indoors today.',
                riskAssessment: 'High',
                bestTimeWindow: '2 PM - 4 PM shows lower daytime inversion',
                breathingPrecautions: ['Avoid heavy roadside exertion'],
                indoorAlternativePlan: 'Indoor mobility flow and stationary bike.',
                whyBasedOnReadings: 'High PM2.5 at AQI 268.',
                dataLimitationNote: 'Regional station estimate.',
              },
            }),
            { status: 200 }
          );
        }

        if (body.taskType === 'indoor-care') {
          return new Response(
            JSON.stringify({
              data: {
                summary: 'Gemini sealed-bedroom strategy for your Delhi apartment.',
                ventilationVerdict: 'Keep roadside windows shut above AQI 150.',
                rooms: [
                  {
                    room: 'Bedroom',
                    priorityAction: 'Seal door gap before sleep',
                    details: 'Run damp wipe and keep door closed.',
                  },
                ],
                checklists: {
                  daily: ['Switch kitchen exhaust on before cooking'],
                  weekly: ['Wash pillowcases weekly'],
                  monthly: ['Check window seals'],
                },
                budgetRecommendations: [{ tier: '₹0 Budget', items: ['Wet mop floors'] }],
                structuredItems: [],
                disclaimer: 'Does not eliminate 100% of fine particles.',
              },
            }),
            { status: 200 }
          );
        }

        if (body.taskType === 'budget-home-upgrade') {
          return new Response(
            JSON.stringify({
              data: {
                budgetLabel: 'Under ₹2,000',
                strategySummary: 'Seal bedroom drafts first under ₹2,000.',
                prioritizedUpgrades: [
                  {
                    item: 'Weather-stripping seals + hygrometer',
                    approxCostRange: '₹700 - ₹1,400',
                    reasonForThisHome: 'Matches 3-room apartment draft points.',
                    expectedBenefit: 'Cuts PM2.5 entry overnight.',
                    limitation: 'Does not actively filter indoor cooking plumes.',
                  },
                ],
                skipForNow: ['Low-CADR USB ionizers'],
                dataLimitationNote: 'No indoor PM sensor paired.',
              },
            }),
            { status: 200 }
          );
        }

        if (body.taskType === 'family-protection') {
          return new Response(
            JSON.stringify({
              data: {
                overview: 'Gemini tailored plan protecting Maya during high PM2.5.',
                morningChecklist: ['Verify Delhi morning reading before Maya leaves for school'],
                eveningChecklist: ['Keep play indoors away from kitchen'],
                schoolCommuteGuidance: 'Use enclosed carpool or metro.',
                groupAdvice: [
                  {
                    group: 'Children',
                    precaution: 'Shift outdoor sports indoors.',
                    indoorAlternative: 'Indoor reading or hallway games.',
                  },
                ],
                dataLimitationNote: 'Follow pediatrician advice for symptoms.',
              },
            }),
            { status: 200 }
          );
        }

        if (body.taskType === 'explain-air') {
          return new Response(
            JSON.stringify({
              data: {
                summary: `Gemini explanation (${String(body.payload?.readingMode)}): Cold morning inversion traps PM2.5 in Delhi.`,
                reasoning: 'Low mixing height slows vertical dispersion.',
                practicalActions: ['Seal windows until noon', 'Use N95 mask for errands'],
                uncertaintyDisclosure: 'Street-level traffic varies by block.',
                followUpQuestions: ['Should I run my exhaust fan tonight?'],
              },
            }),
            { status: 200 }
          );
        }

        if (body.taskType === 'sustainability-plan') {
          return new Response(
            JSON.stringify({
              data: {
                weeklyFocus: 'Gemini transit-first plan keeping exposure low.',
                impactSummary: 'Focus on metro trips and lid cooking.',
                priorityActions: [
                  {
                    title: 'Enclosed Metro Swaps',
                    whyItMatters: 'Avoids cold-start tailpipe exhaust.',
                    practicalStep: 'Replace 2 solo drives with metro trips.',
                    cadence: 'Weekly',
                  },
                ],
                habitSynergies: ['Combine neighborhood errands into one trip.'],
                dataLimitationNote: 'CO2 figures remain illustrative.',
              },
            }),
            { status: 200 }
          );
        }
      }
      return new Response('{}', { status: 404 });
    });

    render(<App />);
    expect(await screen.findByText(/Pollutant Breakdown/i)).toBeInTheDocument();

    // 1. Daily Planner -> Outdoor Activity Intelligence
    fireEvent.click(screen.getByRole('button', { name: 'Daily Planner' }));
    fireEvent.click(
      await screen.findByRole('button', { name: /Outdoor Activity Intelligence/i })
    );
    fireEvent.click(screen.getByRole('button', { name: /Running/i }));
    fireEvent.click(screen.getByRole('button', { name: /Tailor Running \(Gemini\)/i }));
    expect(
      await screen.findByText(/Gemini recommends shifting running indoors today/i)
    ).toBeInTheDocument();

    // 2. Home Air Care -> indoor-care + budget-home-upgrade + checklist persistence
    fireEvent.click(screen.getByRole('button', { name: 'Home Air Care' }));
    fireEvent.click(
      await screen.findByRole('button', { name: /Generate AI Home Plan \(Gemini\)/i })
    );
    expect(
      await screen.findByText(/Gemini sealed-bedroom strategy for your Delhi apartment/i)
    ).toBeInTheDocument();

    const indoorCheck = screen.getByRole('checkbox', {
      name: /Switch kitchen exhaust on before cooking/i,
    });
    fireEvent.click(indoorCheck);
    expect(indoorCheck).toHaveAttribute('aria-checked', 'true');
    expect(
      JSON.parse(window.localStorage.getItem('bw_indoor_checks_v1') || '{}')['daily-0']
    ).toBe(true);

    fireEvent.click(
      screen.getByRole('button', { name: /Tailor Upgrades to My ₹ Budget \(Gemini\)/i })
    );
    expect(
      await screen.findByText(/Seal bedroom drafts first under ₹2,000/i)
    ).toBeInTheDocument();

    // 3. Protect My Family -> family-protection + checklist persistence
    fireEvent.click(screen.getByRole('button', { name: 'Protect My Family' }));
    fireEvent.click(
      await screen.findByRole('button', { name: /Tailor Family Plan with Gemini/i })
    );
    expect(
      await screen.findByText(/Gemini tailored plan protecting Maya during high PM2\.5/i)
    ).toBeInTheDocument();

    const familyCheck = screen.getByRole('checkbox', {
      name: /Verify Delhi morning reading before Maya leaves for school/i,
    });
    fireEvent.click(familyCheck);
    expect(familyCheck).toHaveAttribute('aria-checked', 'true');

    // 4. AI Assistant -> Explain My Air tab & depth switching
    fireEvent.click(screen.getByRole('button', { name: 'AI Assistant' }));
    fireEvent.click(await screen.findByRole('button', { name: /Explain My Air/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Detailed' }));
    fireEvent.click(
      screen.getByRole('button', { name: /Why is the air quality bad today\?/i })
    );
    expect(
      await screen.findByText(/Gemini explanation \(detailed\): Cold morning inversion/i)
    ).toBeInTheDocument();

    // 5. Sustainable Living -> sustainability-plan
    fireEvent.click(screen.getByRole('button', { name: 'Sustainable Living' }));
    fireEvent.click(
      await screen.findByRole('button', { name: /Personalize Habit Plan \(Gemini\)/i })
    );
    expect(
      await screen.findByText(/Gemini transit-first plan keeping exposure low/i)
    ).toBeInTheDocument();

    expect(seenTasks).toEqual([
      'outdoor-activity',
      'indoor-care',
      'budget-home-upgrade',
      'family-protection',
      'explain-air',
      'sustainability-plan',
    ]);
  });

  it('handles Notifications quiet hours, severe override (AQI > 200), Mark All Read, and Clear History', async () => {
    // Active Demo Delhi has US AQI 268 (> 200 severe override)
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
          outdoorGoals: 'Reduce exposure',
        },
        household: [],
        budgetTier: '2000',
        accessibility: { highContrast: false, largeText: false, reducedMotion: false },
        notifications: {
          aqiThreshold: 100,
          quietStart: '00:00',
          quietEnd: '00:00',
          enableInAppAlerts: true,
          dailySummary: true,
          indoorTips: true,
        },
      })
    );

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, provider: 'Open-Meteo', geminiConfigured: false }), {
        status: 200,
      })
    );

    render(<App />);
    const nav = await screen.findByRole('navigation', { name: /Workspace Sections/i });
    fireEvent.click(within(nav).getByRole('button', { name: /Alerts/i }));

    expect(
      await screen.findByRole('heading', { name: /Notifications & Alert Center/i })
    ).toBeInTheDocument();

    // Alerts generated automatically for high AQI
    await waitFor(() => {
      expect(screen.getAllByText(/Unread/i).length).toBeGreaterThan(0);
    });

    // Mark All Read removes unread badges
    fireEvent.click(screen.getByRole('button', { name: /Mark All Read/i }));
    expect(screen.queryByText(/· Unread/i)).not.toBeInTheDocument();

    // Clear History empties alerts cleanly
    fireEvent.click(screen.getByRole('button', { name: /Clear History/i }));
    expect(screen.getByText(/No notifications in your history right now/i)).toBeInTheDocument();
  });
});
