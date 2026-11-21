// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrendChart } from '../src/components/TrendChart.tsx';
import { DEMO_SCENARIOS } from '../src/data/demoData.ts';
import { AirQualityMapView } from '../src/features/AirQualityMapView.tsx';
import { CommuteAssistantView } from '../src/features/CommuteAssistantView.tsx';
import { useAsyncAction } from '../src/hooks/useAsyncAction.ts';
import { clearAiResponseCache } from '../src/services/apiClient.ts';
import type { AirQualitySnapshot, GridStationPoint, UserPreferences } from '../src/types/airQuality.ts';

const TEST_PREFS: UserPreferences = {
  onboardingCompleted: true,
  priorities: ['Lower commute exposure'],
  lifestyleRole: 'office_worker',
  aqiStandard: 'us_aqi',
  tempUnit: 'C',
  demoMode: false,
  schedule: {
    wakeTime: '06:30',
    bedTime: '22:30',
    workStart: '09:00',
    workEnd: '17:30',
    commuteMode: 'public_transit',
    preferredExercise: 'cycling',
    outdoorGoals: 'Safer bike routes',
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
    quietStart: '00:00',
    quietEnd: '00:00',
    enableInAppAlerts: true,
    dailySummary: true,
    indoorTips: true,
  },
};

function makeLiveSnapshot(): AirQualitySnapshot {
  return {
    ...DEMO_SCENARIOS[1].snapshot,
    isDemo: false,
    dataSource: 'Open-Meteo Air Quality',
    freshnessStatus: 'fresh',
    freshnessLabel: 'Just updated',
    location: {
      id: 'om-live-1',
      name: 'Bengaluru',
      country: 'India',
      latitude: 12.97,
      longitude: 77.59,
    },
  };
}

describe('UI Hooks & Refactored Views: useAsyncAction, TrendChart, CommuteAssistantView, AirQualityMapView', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearAiResponseCache();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    clearAiResponseCache();
  });

  it('manages loading, error capture, clearError, and stale-request protection in useAsyncAction', async () => {
    const { result } = renderHook(() => useAsyncAction('Fallback failure'));

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();

    // Resolves cleanly
    let resolved: string | null = null;
    await act(async () => {
      resolved = await result.current.run(async () => 'ok-value');
    });
    expect(resolved).toBe('ok-value');
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();

    // Rejects -> captures error -> clears cleanly
    await act(async () => {
      await result.current.run(async () => {
        throw new Error('Upstream unavailable');
      });
    });
    expect(result.current.error).toBe('Upstream unavailable');
    act(() => {
      result.current.clearError();
    });
    expect(result.current.error).toBeNull();

    // Concurrent race: slow request #1 rejects AFTER fast request #2 succeeds; stale error ignored
    let rejectSlow!: (err: Error) => void;
    const slowPromise = new Promise<string>((_res, rej) => {
      rejectSlow = rej;
    });

    let slowRun!: Promise<string | null>;
    let fastRun!: Promise<string | null>;
    await act(async () => {
      slowRun = result.current.run(() => slowPromise);
      fastRun = result.current.run(async () => 'fresh-ok');
      expect(await fastRun).toBe('fresh-ok');
      rejectSlow(new Error('Stale timeout'));
      expect(await slowRun).toBeNull();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('supports keyboard arrow/Home inspection, metric/timeframe switches, and accessible Table View toggle in TrendChart', () => {
    const snap = makeLiveSnapshot();
    render(<TrendChart snapshot={snap} aqiStandard="us_aqi" />);

    expect(screen.getByText(/Latest:/i)).toBeInTheDocument();

    const buttons = screen.getAllByRole('button', { name: /:/i });
    expect(buttons.length).toBe(snap.hourly24h.length);

    // Focus last point, then press ArrowLeft & Home
    const lastBtn = buttons[buttons.length - 1];
    fireEvent.focus(lastBtn);
    expect(screen.getByText(/Selected:/i)).toBeInTheDocument();

    fireEvent.keyDown(lastBtn, { key: 'Home' });
    const firstLabel = snap.hourly24h[0].label;
    expect(screen.getByText(firstLabel, { selector: 'strong' })).toBeInTheDocument();

    // Switch metric to PM2.5 and range to 30 Days
    fireEvent.click(screen.getByRole('button', { name: 'PM2.5' }));
    fireEvent.click(screen.getByRole('button', { name: '30 Days' }));
    expect(screen.getByText(/Labeled sample 30-day visualization:/i)).toBeInTheDocument();

    // Toggle Table View
    fireEvent.click(screen.getByRole('button', { name: 'Table View' }));
    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();
    expect(table).toHaveTextContent('PM2.5 (µg/m³)');

    fireEvent.click(screen.getByRole('button', { name: 'Chart View' }));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: /interactive trend chart/i })).toBeInTheDocument();
  });

  it('validates trip inputs and executes live Gemini commute strategy with error retry in CommuteAssistantView', async () => {
    const snap = makeLiveSnapshot();
    let attempt = 0;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/ai/recommend')) {
        attempt += 1;
        if (attempt === 1) {
          return new Response(
            JSON.stringify({ error: 'UPSTREAM_ERROR', message: 'Gemini temporarily busy.' }),
            { status: 502 }
          );
        }
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          payload?: { distanceKm?: number; primaryMode?: string; travelWindow?: string };
        };
        return new Response(
          JSON.stringify({
            data: {
              recommendedOption: `Take quiet side-streets (${body.payload?.distanceKm} km, ${body.payload?.primaryMode}, ${body.payload?.travelWindow}).`,
              timingAdjustment: 'Leave 15 minutes later after rush traffic disperses.',
              exposureReductionSteps: ['Avoid arterial junctions'],
              gearChecklist: ['Water bottle', 'N95 mask'],
              tradeOffSummary: 'Slightly slower, cleaner breathing.',
              dataLimitationNote: 'Live street traffic not connected.',
            },
          }),
          { status: 200 }
        );
      }
      return new Response('{}', { status: 404 });
    });

    render(
      <CommuteAssistantView
        snapshot={snap}
        aqiStandard="us_aqi"
        prefs={TEST_PREFS}
        geminiConfigured={true}
      />
    );

    const originInput = screen.getByLabelText(/Starting Point/i);
    const aiBtn = screen.getByRole('button', { name: /Personalize Strategy \(Gemini\)/i });

    // Empty origin disables button and renders validation alert
    fireEvent.change(originInput, { target: { value: '   ' } });
    expect(screen.getByRole('alert')).toHaveTextContent(/Enter both a starting point/i);
    expect(aiBtn).toBeDisabled();

    // Restore valid inputs & customize distance/mode/window
    fireEvent.change(originInput, { target: { value: 'Indiranagar' } });
    fireEvent.change(screen.getByLabelText(/Est\. Distance/i), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/Primary Mode/i), { target: { value: 'cycling' } });
    fireEvent.change(screen.getByLabelText(/Travel Window/i), { target: { value: 'midday' } });
    expect(aiBtn).toBeEnabled();

    // First attempt fails -> AiErrorBanner with Retry Gemini button
    fireEvent.click(aiBtn);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Gemini temporarily busy/i);

    fireEvent.click(screen.getByRole('button', { name: /Retry Gemini/i }));
    expect(
      await screen.findByText(/Take quiet side-streets \(10 km, cycling, midday\)/i)
    ).toBeInTheDocument();
  });

  it('loads 9-sector regional grid after Retry and updates inspector on sector click in AirQualityMapView', async () => {
    const snap = makeLiveSnapshot();
    let gridAttempt = 0;

    const mockStations: GridStationPoint[] = [
      { id: 'g-0', label: 'Bengaluru Central', direction: 'Center', distanceKm: 0, latitude: 12.97, longitude: 77.59, usAqi: 124, eaqi: 52, pm2_5: 44.8, pm10: 76.2, no2: 41.0, dominantPollutant: 'pm2_5' },
      { id: 'g-1', label: 'North Sector', direction: 'N', distanceKm: 13, latitude: 13.09, longitude: 77.59, usAqi: 92, eaqi: 38, pm2_5: 31.2, pm10: 54.0, no2: 24.5, dominantPollutant: 'pm2_5' },
      { id: 'g-2', label: 'Northeast Corridor', direction: 'NE', distanceKm: 13, latitude: 13.06, longitude: 77.69, usAqi: 108, eaqi: 44, pm2_5: 37.0, pm10: 61.0, no2: 29.0, dominantPollutant: 'pm2_5' },
      { id: 'g-3', label: 'East District', direction: 'E', distanceKm: 14, latitude: 12.97, longitude: 77.73, usAqi: 130, eaqi: 55, pm2_5: 46.0, pm10: 80.0, no2: 43.0, dominantPollutant: 'pm2_5' },
      { id: 'g-4', label: 'Southeast Belt', direction: 'SE', distanceKm: 13, latitude: 12.88, longitude: 77.69, usAqi: 138, eaqi: 58, pm2_5: 50.0, pm10: 84.0, no2: 45.0, dominantPollutant: 'pm2_5' },
      { id: 'g-5', label: 'South Sector', direction: 'S', distanceKm: 13, latitude: 12.85, longitude: 77.59, usAqi: 112, eaqi: 46, pm2_5: 39.0, pm10: 65.0, no2: 33.0, dominantPollutant: 'pm2_5' },
      { id: 'g-6', label: 'Southwest Belt', direction: 'SW', distanceKm: 13, latitude: 12.88, longitude: 77.49, usAqi: 98, eaqi: 40, pm2_5: 33.5, pm10: 58.0, no2: 27.0, dominantPollutant: 'pm2_5' },
      { id: 'g-7', label: 'West District', direction: 'W', distanceKm: 14, latitude: 12.97, longitude: 77.45, usAqi: 118, eaqi: 49, pm2_5: 41.0, pm10: 70.0, no2: 36.0, dominantPollutant: 'pm2_5' },
      { id: 'g-8', label: 'Northwest Corridor', direction: 'NW', distanceKm: 13, latitude: 13.06, longitude: 77.49, usAqi: 102, eaqi: 42, pm2_5: 35.0, pm10: 59.0, no2: 28.0, dominantPollutant: 'pm2_5' },
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input).includes('/api/air-quality/grid')) {
        gridAttempt += 1;
        if (gridAttempt === 1) {
          return new Response(
            JSON.stringify({ error: 'GRID_UNAVAILABLE', message: 'Grid sampler timed out.' }),
            { status: 500 }
          );
        }
        return new Response(JSON.stringify({ stations: mockStations }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    });

    render(
      <AirQualityMapView
        snapshot={snap}
        aqiStandard="us_aqi"
        onOpenLocationModal={vi.fn()}
      />
    );

    expect(await screen.findByText(/Grid sampler timed out/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Retry$/i }));

    const northBtn = await screen.findByRole('button', { name: /^N sector, North Sector/i });
    fireEvent.click(northBtn);

    await waitFor(() => {
      expect(northBtn).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('heading', { name: 'North Sector' })).toBeInTheDocument();
    });
    expect(screen.getByText(/Lowest-Reading Sector Nearby/i).parentElement).toHaveTextContent(
      'North Sector (N)'
    );
  });
});
