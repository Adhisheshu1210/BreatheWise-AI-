import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'http';
import {
  clearProviderCaches,
  OpenMeteoProvider,
  ProviderError,
} from '../server/airQualityProvider.ts';
import {
  clearAiResponseCache,
  fetchAirQualityApi,
  fetchRegionalGridApi,
  requestStructuredAiApi,
  searchLocationsApi,
  sendChatMessageApi,
} from '../src/services/apiClient.ts';
import type { AiContextPayload } from '../src/types/airQuality.ts';

const generateContentMock = vi.fn();

vi.mock('@google/genai', async () => {
  const actual = await vi.importActual<typeof import('@google/genai')>('@google/genai');
  return {
    ...actual,
    GoogleGenAI: class MockGoogleGenAI {
      models = {
        generateContent: generateContentMock,
      };
    },
  };
});

import {
  GeminiServiceError,
  generateChatResponse,
  generateStructuredRecommendation,
  VALID_RECOMMENDATION_TASKS,
  type ChatContextInput,
} from '../server/geminiService.ts';
import { createApp } from '../server.ts';

async function startTestServer(): Promise<{ base: string; close: () => Promise<void> }> {
  const app = createApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return {
    base: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

describe('OpenMeteoProvider: Location Search, Air Quality, Timeout, Rate Limit & Invalid Data', () => {
  beforeEach(() => {
    clearProviderCaches();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearProviderCaches();
  });

  it('filters invalid geocoding entries and handles empty results cleanly', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [
            { id: 1, name: 'London', latitude: 51.5, longitude: -0.12, country: 'United Kingdom' },
            { id: 2, name: '', latitude: 10, longitude: 10 },
            { id: 3, name: 'BadCoords', latitude: 999, longitude: 10 },
            { id: 4, name: 'NaNCoords', latitude: null, longitude: 10 },
          ],
        }),
        { status: 200 }
      )
    );

    const provider = new OpenMeteoProvider();
    const list = await provider.searchLocations('London');
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('London');

    const empty = await provider.searchLocations('L');
    expect(empty).toEqual([]);
  });

  it('maps HTTP 429 rate limit, 500 failure, AbortError timeout, and malformed JSON to structured ProviderErrors', async () => {
    const provider = new OpenMeteoProvider();

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Too Many Requests', { status: 429 })
    );
    await expect(provider.searchLocations('Delhi')).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      status: 429,
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Server Error', { status: 500 })
    );
    await expect(provider.searchLocations('Mumbai')).rejects.toMatchObject({
      code: 'UPSTREAM_HTTP_ERROR',
      status: 502,
    });

    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => {
      const abortErr = new Error('The operation was aborted.');
      abortErr.name = 'AbortError';
      throw abortErr;
    });
    await expect(provider.searchLocations('Tokyo')).rejects.toMatchObject({
      code: 'TIMEOUT',
      status: 504,
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('<html>502 Bad Gateway</html>', { status: 200 })
    );
    await expect(provider.searchLocations('Berlin')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      status: 502,
    });
  });

  it('rejects incomplete Open-Meteo air quality payloads and guards bad timestamps / negative pollutants', async () => {
    const provider = new OpenMeteoProvider();

    // Missing both current and hourly
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ latitude: 28.6, longitude: 77.2 }), { status: 200 })
    );
    await expect(
      provider.fetchAirQuality({
        id: 'bad-1',
        name: 'Nowhere',
        country: 'Test',
        latitude: 28.6,
        longitude: 77.2,
      })
    ).rejects.toBeInstanceOf(ProviderError);

    // Invalid timestamp string + negative/NaN sensor values + failed weather call
    const recentIso = new Date(Date.now() - 15 * 60 * 1000).toISOString().slice(0, 16);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('air-quality-api.open-meteo.com')) {
        return new Response(
          JSON.stringify({
            latitude: 12.97,
            longitude: 77.59,
            current: {
              time: 'invalid-date-string',
              pm2_5: 25.0,
              pm10: -12,
              nitrogen_dioxide: null,
              us_aqi: null, // Should fall back deterministically to PM2.5 formula (~79)
              european_aqi: -5, // Should become null
            },
            hourly: {
              time: [recentIso],
              pm2_5: [25.0],
              pm10: [-9],
              us_aqi: [79],
              european_aqi: [30],
            },
          }),
          { status: 200 }
        );
      }
      return new Response('Weather Down', { status: 503 });
    });

    const snap = await provider.fetchAirQuality({
      id: 'blr',
      name: 'Bengaluru',
      country: 'India',
      latitude: 12.97,
      longitude: 77.59,
    });
    expect(snap.currentUsAqi).toBeGreaterThan(50);
    expect(snap.currentUsAqi).toBeLessThanOrEqual(100);
    expect(snap.currentEaqi).toBeNull();
    expect(snap.freshnessStatus).toBe('aging');
    expect(snap.freshnessLabel).toBe('Timestamp unavailable');
    expect(snap.pollutants.find((p) => p.code === 'pm10')?.value).toBeNull();
    expect(snap.weather.temperatureC).toBeNull(); // Graceful weather fallback
    expect(snap.hourly24h[0].pm10).toBeNull();
  });

  it('rejects empty/all-null regional grid responses and parses valid 9-point grids', async () => {
    const provider = new OpenMeteoProvider();

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify([{ current: {} }]), { status: 200 })
    );
    await expect(provider.fetchRegionalGrid(28.61, 77.21, 'Delhi')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      status: 502,
    });

    const ninePoints = Array.from({ length: 9 }, (_, i) => ({
      current: {
        pm2_5: 20 + i,
        pm10: 40 + i,
        nitrogen_dioxide: 15,
        us_aqi: 70 + i * 2,
        european_aqi: 30 + i,
      },
    }));
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(ninePoints), { status: 200 })
    );

    const grid = await provider.fetchRegionalGrid(28.61, 77.21, 'Delhi');
    expect(grid).toHaveLength(9);
    expect(grid[0].direction).toBe('Center');
    expect(grid[0].usAqi).toBe(70);
  });
});

describe('Gemini AI Service: Key Errors, Upstream Failures & Output Validation across All 8 Tasks', () => {
  const sampleContext: ChatContextInput = {
    locationName: 'New Delhi, India',
    coordinates: '28.61, 77.21',
    isDemo: false,
    dataSource: 'Open-Meteo Air Quality',
    dataTimestampIso: '2026-11-20T10:00:00Z',
    freshnessStatus: 'fresh',
    freshnessLabel: 'Just updated',
    aqiStandard: 'US EPA AQI',
    currentAqi: 215,
    categoryLabel: 'Very Poor',
    primaryPollutant: 'pm2_5',
    pollutantsSummary: 'PM2.5: 140 µg/m³ (9.3× WHO guide)',
    missingPollutants: [],
    weatherSummary: 'Temp 18°C, Humidity 65%, Wind 4 km/h',
  };

  let origKey: string | undefined;

  beforeEach(() => {
    origKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'test-fake-key-for-unit-mock';
    generateContentMock.mockReset();
  });

  afterEach(() => {
    if (origKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = origKey;
    vi.restoreAllMocks();
  });

  it('rejects missing or placeholder GEMINI_API_KEY with 503 API_KEY_MISSING', async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(
      generateChatResponse({ message: 'How is the air?', history: [], context: sampleContext })
    ).rejects.toMatchObject({ code: 'API_KEY_MISSING', status: 503 });

    process.env.GEMINI_API_KEY = 'MY_GEMINI_API_KEY';
    await expect(
      generateStructuredRecommendation({
        taskType: 'daily-plan',
        context: sampleContext,
        payload: {},
      })
    ).rejects.toMatchObject({ code: 'API_KEY_MISSING', status: 503 });
  });

  it('maps Gemini 403 invalid key, 429 quota exceeded, 500 error, and timeout cleanly', async () => {
    generateContentMock.mockRejectedValueOnce(new Error('403 API_KEY_INVALID'));
    await expect(
      generateChatResponse({ message: 'Test', history: [], context: sampleContext })
    ).rejects.toMatchObject({ code: 'INVALID_API_KEY', status: 403 });
    expect(generateContentMock).toHaveBeenCalledTimes(1); // Non-retryable

    generateContentMock.mockReset();
    generateContentMock.mockRejectedValue(new Error('429 RESOURCE_EXHAUSTED quota'));
    await expect(
      generateChatResponse({ message: 'Test', history: [], context: sampleContext })
    ).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED', status: 429 });

    generateContentMock.mockReset();
    generateContentMock.mockRejectedValue(new Error('DEADLINE_EXCEEDED timeout'));
    await expect(
      generateChatResponse({ message: 'Test', history: [], context: sampleContext })
    ).rejects.toMatchObject({ code: 'TIMEOUT', status: 504 });

    generateContentMock.mockReset();
    generateContentMock.mockRejectedValue(new Error('Internal backend error 500'));
    await expect(
      generateChatResponse({ message: 'Test', history: [], context: sampleContext })
    ).rejects.toMatchObject({ code: 'UPSTREAM_ERROR', status: 502 });
  });

  it('rejects empty chat responses and invalid/incomplete JSON across all 8 structured workflows', async () => {
    // Empty chat response
    generateContentMock.mockResolvedValueOnce({ text: '   ' });
    await expect(
      generateChatResponse({ message: 'Hello', history: [], context: sampleContext })
    ).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE', status: 502 });

    // Plain prose / non-JSON
    generateContentMock.mockResolvedValueOnce({ text: 'Here is your plan: stay inside.' });
    await expect(
      generateStructuredRecommendation({
        taskType: 'daily-plan',
        context: sampleContext,
        payload: {},
      })
    ).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE', status: 502 });

    // JSON array instead of object
    generateContentMock.mockResolvedValueOnce({ text: '[{"title": "bad"}]' });
    await expect(
      generateStructuredRecommendation({
        taskType: 'daily-plan',
        context: sampleContext,
        payload: {},
      })
    ).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE', status: 502 });

    // Incomplete structured payloads per task
    const invalidPayloads: Array<{ task: (typeof VALID_RECOMMENDATION_TASKS)[number]; json: unknown }> = [
      { task: 'daily-plan', json: { planSummary: 'Summary', items: [{ title: '', action: '' }] } },
      {
        task: 'family-protection',
        json: { overview: 'Overview', morningChecklist: [], groupAdvice: [{ group: 'Kids', precaution: '' }] },
      },
      {
        task: 'indoor-care',
        json: { summary: 'Summary', rooms: [{ room: 'Bedroom', priorityAction: '', details: '' }], checklists: { daily: [] } },
      },
      {
        task: 'outdoor-activity',
        json: {
          verdict: 'Go outside',
          riskAssessment: 'unrecognized-tier',
          bestTimeWindow: '1 PM',
          indoorAlternativePlan: 'Yoga',
        },
      },
      {
        task: 'explain-air',
        json: { summary: 'Summary', reasoning: '', practicalActions: [] },
      },
      {
        task: 'sustainability-plan',
        json: { weeklyFocus: 'Focus', priorityActions: [{ title: '', practicalStep: '' }] },
      },
      {
        task: 'commute-advice',
        json: { recommendedOption: 'Metro', timingAdjustment: '', exposureReductionSteps: [] },
      },
      {
        task: 'budget-home-upgrade',
        json: { strategySummary: 'Budget', prioritizedUpgrades: [{ item: '', reasonForThisHome: '' }] },
      },
    ];

    for (const entry of invalidPayloads) {
      generateContentMock.mockResolvedValueOnce({ text: JSON.stringify(entry.json) });
      await expect(
        generateStructuredRecommendation({
          taskType: entry.task,
          context: sampleContext,
          payload: {},
        })
      ).rejects.toBeInstanceOf(GeminiServiceError);
    }
  });

  it('accepts and normalizes valid structured responses across all 8 Gemini workflows + chat', async () => {
    generateContentMock.mockResolvedValueOnce({ text: 'Grounded chat guidance for New Delhi.' });
    const chatRes = await generateChatResponse({
      message: 'Should I run outside?',
      history: [{ role: 'user', content: 'Hi' }],
      context: sampleContext,
    });
    expect(chatRes.reply).toContain('New Delhi');

    const validPayloads: Record<(typeof VALID_RECOMMENDATION_TASKS)[number], unknown> = {
      'daily-plan': {
        planSummary: 'Stay indoors in New Delhi at AQI 215.',
        dataLimitationNote: 'Hyperlocal traffic may vary.',
        items: [
          {
            time: '07:00',
            title: 'Keep Windows Sealed',
            category: 'indoor',
            priority: 'high',
            action: 'Delay airing rooms.',
            alternative: 'Run exhaust briefly when cooking.',
            explanation: 'Avoids morning smog entry.',
          },
        ],
      },
      'family-protection': {
        overview: 'Protect children and seniors during AQI 215.',
        morningChecklist: ['Check morning AQI before school drop-off.'],
        eveningChecklist: ['Run kitchen exhaust while cooking dinner.'],
        schoolCommuteGuidance: 'Use enclosed transit.',
        groupAdvice: [
          {
            group: 'Children',
            precaution: 'Shift physical play indoors.',
            indoorAlternative: 'Indoor stretching or reading.',
          },
        ],
        dataLimitationNote: 'Non-diagnostic guidance.',
      },
      'indoor-care': {
        summary: 'Close roadside windows and use wet mopping.',
        ventilationVerdict: 'Keep exterior windows closed above AQI 150.',
        rooms: [
          {
            room: 'Bedroom',
            priorityAction: 'Seal door gap',
            details: 'Damp wipe surfaces before sleep.',
          },
        ],
        checklists: {
          daily: ['Run kitchen fan during cooking.'],
          weekly: ['Wash bedding.'],
          monthly: ['Inspect seals.'],
        },
        budgetRecommendations: [{ tier: '₹0 Budget', items: ['Wet mop floors.'] }],
        structuredItems: [],
        disclaimer: 'Reduces indoor particle load.',
      },
      'outdoor-activity': {
        verdict: 'Move run indoors today.',
        riskAssessment: 'High',
        bestTimeWindow: 'Midday 1-3 PM is lowest',
        breathingPrecautions: ['Avoid heavy mouth breathing outdoors.'],
        indoorAlternativePlan: '25-minute indoor bodyweight workout.',
        whyBasedOnReadings: 'High PM2.5 increases inhaled load.',
        dataLimitationNote: 'Regional AQI snapshot.',
      },
      'explain-air': {
        summary: 'PM2.5 is currently elevated in New Delhi.',
        reasoning: 'Calm winds (4 km/h) limit pollutant dispersion.',
        practicalActions: ['Wear N95 outdoors', 'Keep windows shut'],
        uncertaintyDisclosure: 'Street-level spikes may be higher.',
        followUpQuestions: ['When will wind pick up?'],
      },
      'sustainability-plan': {
        weeklyFocus: 'Use shared metro while avoiding outdoor exertion.',
        impactSummary: 'Consistent transit swaps lower local NO2.',
        priorityActions: [
          {
            title: 'Metro commute',
            whyItMatters: 'Cuts cold-start exhaust.',
            practicalStep: 'Take metro 3 days this week.',
            cadence: 'Weekly',
          },
        ],
        habitSynergies: ['Bundle errands into one trip.'],
        dataLimitationNote: 'CO2 ranges are approximate.',
      },
      'commute-advice': {
        recommendedOption: 'Choose enclosed metro with N95 on station walks.',
        timingAdjustment: 'Shift trip 30 minutes off-peak.',
        exposureReductionSteps: ['Walk 1 block away from arterial road.'],
        gearChecklist: ['Snug N95 respirator'],
        tradeOffSummary: 'Adds ~5 min for lower exhaust.',
        dataLimitationNote: 'Live street traffic not connected.',
      },
      'budget-home-upgrade': {
        budgetLabel: 'Under ₹2,000',
        strategySummary: 'Prioritize window sealing and hygrometer.',
        prioritizedUpgrades: [
          {
            item: 'Foam weather-stripping tape',
            approxCostRange: '₹300 - ₹500',
            reasonForThisHome: 'Reduces dusty drafts.',
            expectedBenefit: 'Cleaner sleep room.',
            limitation: 'Does not filter gases.',
          },
        ],
        skipForNow: ['Small ionizer gadgets'],
        dataLimitationNote: 'Based on declared home profile.',
      },
    };

    for (const task of VALID_RECOMMENDATION_TASKS) {
      // Wrap one in ```json fence to verify fenced extraction works too
      const raw =
        task === 'daily-plan'
          ? `\`\`\`json\n${JSON.stringify(validPayloads[task])}\n\`\`\``
          : JSON.stringify(validPayloads[task]);
      generateContentMock.mockResolvedValueOnce({ text: raw });
      const result = await generateStructuredRecommendation({
        taskType: task,
        context: sampleContext,
        payload: {},
      });
      expect(result).toBeTruthy();
    }
  });
});

describe('Express API Routes & Frontend apiClient Reliability', () => {
  afterEach(() => {
    clearAiResponseCache();
    clearProviderCaches();
    vi.restoreAllMocks();
  });

  it('returns proper HTTP status codes for rate limit (429) and timeout (504) on Express routes', async () => {
    const srv = await startTestServer();
    try {
      const origFetch = globalThis.fetch;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.startsWith(srv.base)) {
          return origFetch(input, init);
        }
        if (url.includes('geocoding-api.open-meteo.com')) {
          return new Response('Rate limited', { status: 429 });
        }
        if (url.includes('air-quality-api.open-meteo.com')) {
          const err = new Error('Aborted');
          err.name = 'AbortError';
          throw err;
        }
        return new Response('{}', { status: 200 });
      });

      const rateRes = await origFetch(`${srv.base}/api/location/search?q=London`);
      expect(rateRes.status).toBe(429);
      const rateJson = (await rateRes.json()) as { error: string };
      expect(rateJson.error).toBe('RATE_LIMITED');
      expect(rateRes.headers.get('x-content-type-options')).toBe('nosniff');
      expect(rateRes.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
      expect(rateRes.headers.get('permissions-policy')).toContain('geolocation=(self)');

      const malformedRes = await origFetch(`${srv.base}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{invalid-json',
      });
      expect(malformedRes.status).toBe(400);
      const malformedJson = (await malformedRes.json()) as { error: string };
      expect(malformedJson.error).toBe('BAD_REQUEST');

      const timeoutRes = await origFetch(
        `${srv.base}/api/air-quality?lat=51.5&lon=-0.12&name=London`
      );
      expect(timeoutRes.status).toBe(504);
      const timeoutJson = (await timeoutRes.json()) as { error: string };
      expect(timeoutJson.error).toBe('TIMEOUT');

      // Exceeding 30 requests/min on /api/ai/* triggers Express rate limiter (429 + Retry-After)
      let hitRateLimit = false;
      for (let i = 0; i < 32; i++) {
        const res = await origFetch(`${srv.base}/api/ai/recommend`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskType: 'invalid-task', context: [] }),
        });
        if (res.status === 429) {
          hitRateLimit = true;
          expect(res.headers.get('retry-after')).toBeTruthy();
          const body = (await res.json()) as { error: string };
          expect(body.error).toBe('RATE_LIMITED');
          break;
        }
      }
      expect(hitRateLimit).toBe(true);
    } finally {
      await srv.close();
    }
  });

  it('rejects malformed HTTP 200 JSON or missing envelopes in apiClient without caching bad responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('<html>Broken Proxy</html>', { status: 200 })
    );
    await expect(searchLocationsApi('Paris')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 })
    );
    await expect(
      fetchAirQualityApi({
        name: 'Paris',
        country: 'France',
        latitude: 48.85,
        longitude: 2.35,
      })
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 })
    );
    await expect(fetchRegionalGridApi(48.85, 2.35, 'Paris')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });

    const validClientContext: AiContextPayload = {
      locationName: 'Paris, France',
      coordinates: '48.85, 2.35',
      isDemo: false,
      dataSource: 'Open-Meteo Air Quality',
      dataTimestampIso: '2026-11-20T10:00:00Z',
      freshnessStatus: 'fresh',
      freshnessLabel: 'Just updated',
      aqiStandard: 'US EPA AQI',
      currentAqi: 62,
      categoryLabel: 'Moderate',
      primaryPollutant: 'pm2_5',
      pollutantsSummary: 'PM2.5: 16 µg/m³',
      missingPollutants: [],
      weatherSummary: '15°C',
      hourlyWindowSummary: 'Steady afternoon air',
      lifestyleRole: 'general',
      priorities: ['Protect my family'],
      scheduleSummary: 'Work 09:00–17:00',
      householdSummary: 'None specified',
      budgetTier: '2000',
      indoorSummary: 'Apartment, no purifier',
      sustainabilitySummary: 'Score 50/100',
      recentExposureSummary: 'None logged',
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ reply: '   ' }), { status: 200 })
    );
    await expect(
      sendChatMessageApi({
        message: 'Hi',
        history: [],
        context: validClientContext,
      })
    ).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' });

    // Missing `data` object should reject and not populate cache
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: null }), { status: 200 })
    );
    await expect(
      requestStructuredAiApi({
        taskType: 'daily-plan',
        context: validClientContext,
        payload: { x: 1 },
      })
    ).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' });

    // Subsequent valid response succeeds (proving invalid one wasn't cached)
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { planSummary: 'Valid', items: [] } }), { status: 200 })
    );
    const valid = await requestStructuredAiApi<{ planSummary: string }>({
      taskType: 'daily-plan',
      context: validClientContext,
      payload: { x: 1 },
    });
    expect(valid.planSummary).toBe('Valid');
  });
});
