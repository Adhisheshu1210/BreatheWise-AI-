import { describe, expect, it } from 'vitest';
import { DEMO_SCENARIOS } from '../src/data/demoData.ts';
import {
  evaluateActivityGuidance,
  OUTDOOR_ACTIVITIES,
} from '../src/data/educationContent.ts';
import {
  buildPollutantReadings,
  buildPersonalizedDailyPlan,
  calculateSustainabilityScore,
  calculateUsAqiFromPm25,
  computeFreshness,
  determinePrimaryPollutant,
  formatTemperature,
  generateAlertsFromData,
  getAqiCategory,
  isWithinQuietHours,
  summarizeHourlyWindows,
} from '../src/utils/aqi.ts';
import {
  buildAiContextPayload,
  buildDemoBudgetUpgradeAi,
  buildDemoCommuteAi,
  buildDemoExplainAir,
  buildDemoFamilyPlan,
  buildDemoIndoorCarePlan,
  buildDemoOutdoorActivityAi,
  buildDemoSustainabilityAi,
  normalizeDailyPlanItems,
} from '../src/services/apiClient.ts';
import {
  validateCommuteInput,
  validateCommunityInitiativeInput,
  validateCoordinates,
  validateCustomGoalInput,
  validateExposureLogInput,
  validatePollutionConcernInput,
} from '../src/utils/validation.ts';
import { normalizeAndAuditContext } from '../server/geminiService.ts';

describe('AQI Calculation & Exact Category Boundaries', () => {
  it('classifies US EPA AQI across all exact lower/upper category boundaries', () => {
    expect(getAqiCategory(0, 'us_aqi').id).toBe('good');
    expect(getAqiCategory(50, 'us_aqi').id).toBe('good');
    expect(getAqiCategory(51, 'us_aqi').id).toBe('moderate');
    expect(getAqiCategory(100, 'us_aqi').id).toBe('moderate');
    expect(getAqiCategory(101, 'us_aqi').id).toBe('sensitive');
    expect(getAqiCategory(150, 'us_aqi').id).toBe('sensitive');
    expect(getAqiCategory(151, 'us_aqi').id).toBe('poor');
    expect(getAqiCategory(200, 'us_aqi').id).toBe('poor');
    expect(getAqiCategory(201, 'us_aqi').id).toBe('very_poor');
    expect(getAqiCategory(300, 'us_aqi').id).toBe('very_poor');
    expect(getAqiCategory(301, 'us_aqi').id).toBe('severe');
    expect(getAqiCategory(500, 'us_aqi').id).toBe('severe');
  });

  it('classifies European EAQI across all exact boundaries without mixing US AQI', () => {
    expect(getAqiCategory(0, 'eaqi').label).toContain('Good');
    expect(getAqiCategory(20, 'eaqi').label).toContain('Good');
    expect(getAqiCategory(21, 'eaqi').label).toContain('Fair');
    expect(getAqiCategory(40, 'eaqi').label).toContain('Fair');
    expect(getAqiCategory(41, 'eaqi').label).toContain('Moderate');
    expect(getAqiCategory(60, 'eaqi').label).toContain('Moderate');
    expect(getAqiCategory(61, 'eaqi').label).toContain('Poor');
    expect(getAqiCategory(80, 'eaqi').label).toContain('Poor');
    expect(getAqiCategory(81, 'eaqi').label).toContain('Very Poor');
    expect(getAqiCategory(100, 'eaqi').label).toContain('Very Poor');
    expect(getAqiCategory(101, 'eaqi').label).toContain('Extremely Poor');
  });

  it('handles null, NaN, Infinity, and negative AQI values safely', () => {
    expect(getAqiCategory(null, 'us_aqi').id).toBe('moderate');
    expect(getAqiCategory(Number.NaN, 'us_aqi').id).toBe('moderate');
    expect(getAqiCategory(Number.POSITIVE_INFINITY, 'us_aqi').id).toBe('moderate');
    expect(getAqiCategory(-10, 'us_aqi').id).toBe('moderate');
    expect(getAqiCategory(Number.NaN, 'eaqi').id).toBe('moderate');
    expect(getAqiCategory(-1, 'eaqi').id).toBe('moderate');
  });

  it('calculates US EPA PM2.5 AQI sub-index accurately across breakpoints and invalid inputs', () => {
    expect(calculateUsAqiFromPm25(0)).toBe(0);
    expect(calculateUsAqiFromPm25(9.0)).toBe(50);
    expect(calculateUsAqiFromPm25(9.1)).toBe(51);
    expect(calculateUsAqiFromPm25(35.4)).toBe(100);
    expect(calculateUsAqiFromPm25(35.5)).toBe(101);
    expect(calculateUsAqiFromPm25(55.4)).toBe(150);
    expect(calculateUsAqiFromPm25(55.5)).toBe(151);
    expect(calculateUsAqiFromPm25(125.4)).toBe(200);
    expect(calculateUsAqiFromPm25(225.4)).toBe(300);
    expect(calculateUsAqiFromPm25(500.4)).toBe(500);
    expect(calculateUsAqiFromPm25(750)).toBe(500);
    expect(calculateUsAqiFromPm25(Number.NaN)).toBe(0);
    expect(calculateUsAqiFromPm25(Number.POSITIVE_INFINITY)).toBe(0);
    expect(calculateUsAqiFromPm25(-12)).toBe(0);
  });
});

describe('Pollutant Parsing, Invalid Environmental Data, Freshness & Temperature', () => {
  it('parses valid readings and rejects null, NaN, Infinity, and negative concentrations', () => {
    const readings = buildPollutantReadings({
      pm2_5: 45,
      pm10: null,
      no2: 30.44,
      o3: Number.NaN,
      so2: -8.5,
      co: Number.POSITIVE_INFINITY,
    });
    const byCode = Object.fromEntries(readings.map((r) => [r.code, r]));
    expect(byCode.pm2_5.value).toBe(45);
    expect(byCode.pm2_5.benchmarkRatio).toBe(3); // 45 / 15 WHO 24h benchmark
    expect(byCode.pm10.value).toBeNull();
    expect(byCode.pm10.benchmarkRatio).toBeNull();
    expect(byCode.no2.value).toBe(30.4);
    expect(byCode.o3.value).toBeNull();
    expect(byCode.so2.value).toBeNull();
    expect(byCode.co.value).toBeNull();
    expect(determinePrimaryPollutant(readings)).toBe('pm2_5');
  });

  it('returns null primary pollutant when all readings are invalid or missing', () => {
    const emptyReadings = buildPollutantReadings({
      pm2_5: null,
      pm10: -1,
      no2: Number.NaN,
    });
    expect(determinePrimaryPollutant(emptyReadings)).toBeNull();
  });

  it('evaluates data freshness across valid ages, invalid timestamps, and demo mode', () => {
    const now = Date.parse('2026-11-20T12:00:00Z');
    expect(computeFreshness('2026-11-20T11:50:00Z', false, now).status).toBe('fresh');
    expect(computeFreshness('2026-11-20T11:00:00Z', false, now).status).toBe('recent');
    expect(computeFreshness('2026-11-20T09:30:00Z', false, now).status).toBe('aging');
    expect(computeFreshness('2026-11-20T06:00:00Z', false, now).status).toBe('stale');
    expect(computeFreshness('2026-11-20T06:00:00Z', true, now).status).toBe('demo');

    const badTs = computeFreshness('not-a-timestamp', false, now);
    expect(badTs.status).toBe('aging');
    expect(badTs.label).toBe('Timestamp unavailable');
  });

  it('formats Celsius/Fahrenheit temperatures safely including null and non-finite inputs', () => {
    expect(formatTemperature(20, 'C')).toBe('20 °C');
    expect(formatTemperature(20, 'F')).toBe('68 °F');
    expect(formatTemperature(null, 'C')).toBe('—');
    expect(formatTemperature(Number.NaN, 'F')).toBe('—');
    expect(formatTemperature(Number.POSITIVE_INFINITY, 'C')).toBe('—');
  });

  it('checks overnight, daytime, and malformed quiet hours safely', () => {
    const at2330 = new Date(2026, 10, 20, 23, 30);
    const at0315 = new Date(2026, 10, 20, 3, 15);
    const at1400 = new Date(2026, 10, 20, 14, 0);
    expect(isWithinQuietHours('22:00', '06:30', at2330)).toBe(true);
    expect(isWithinQuietHours('22:00', '06:30', at0315)).toBe(true);
    expect(isWithinQuietHours('22:00', '06:30', at1400)).toBe(false);
    expect(isWithinQuietHours('13:00', '15:00', at1400)).toBe(true);
    expect(isWithinQuietHours('22:00', '22:00', at2330)).toBe(false);
    expect(isWithinQuietHours('bad', '06:30', at2330)).toBe(false);
  });

  it('generates severe, spike, stagnation, and nominal alerts deterministically', () => {
    const alerts = generateAlertsFromData({
      usAqi: 240,
      windSpeedKmh: 3.5,
      isDemo: true,
      hourly24h: [
        { timestamp: '1', label: '1', usAqi: 120, eaqi: 40, pm2_5: 30, pm10: 50, no2: 20, o3: 30 },
        { timestamp: '2', label: '2', usAqi: 130, eaqi: 45, pm2_5: 35, pm10: 55, no2: 22, o3: 32 },
        { timestamp: '3', label: '3', usAqi: 150, eaqi: 55, pm2_5: 45, pm10: 65, no2: 25, o3: 35 },
        { timestamp: '4', label: '4', usAqi: 180, eaqi: 70, pm2_5: 65, pm10: 90, no2: 28, o3: 38 },
        { timestamp: '5', label: '5', usAqi: 210, eaqi: 82, pm2_5: 85, pm10: 110, no2: 30, o3: 40 },
        { timestamp: '6', label: '6', usAqi: 240, eaqi: 95, pm2_5: 105, pm10: 140, no2: 35, o3: 42 },
      ],
    });
    expect(alerts.some((a) => a.category === 'aqi' && a.severity === 'severe')).toBe(true);
    expect(alerts.some((a) => a.category === 'spike')).toBe(true);
    expect(alerts.some((a) => a.category === 'ventilation')).toBe(true);

    const nominal = generateAlertsFromData({
      usAqi: 35,
      windSpeedKmh: 12,
      isDemo: false,
      hourly24h: [],
    });
    expect(nominal).toHaveLength(1);
    expect(nominal[0].severity).toBe('info');
  });

  it('summarizes 24h hourly trajectory and handles missing/NaN entries safely', () => {
    expect(summarizeHourlyWindows([], 'us_aqi')).toContain('unavailable');
    expect(
      summarizeHourlyWindows(
        [
          {
            timestamp: '1',
            label: '8 AM',
            usAqi: Number.NaN,
            eaqi: null,
            pm2_5: null,
            pm10: null,
            no2: null,
            o3: null,
          },
        ],
        'us_aqi'
      )
    ).toContain('unavailable');

    const summary = summarizeHourlyWindows(DEMO_SCENARIOS[0].snapshot.hourly24h, 'us_aqi');
    expect(summary).toContain('Lowest 24h reading:');
    expect(summary).toContain('Peak 24h reading:');
  });
});

describe('Daily Planner, Family, Indoor, Commute, Outdoor & Sustainability Workflows', () => {
  it('adapts daily planner recommendations to AQI, exercise choice, and household sensitivity', () => {
    const smogDemo = DEMO_SCENARIOS[0].snapshot; // AQI 268
    const cleanDemo = DEMO_SCENARIOS[3].snapshot; // AQI 28

    const smogPlan = buildPersonalizedDailyPlan({
      snapshot: smogDemo,
      schedule: {
        wakeTime: '06:45',
        bedTime: '22:00',
        workStart: '08:30',
        workEnd: '17:30',
        commuteMode: 'walking',
        preferredExercise: 'running',
        outdoorGoals: 'Stay safe',
      },
      role: 'parent',
      hasSensitiveFamily: true,
    });

    const cleanPlan = buildPersonalizedDailyPlan({
      snapshot: cleanDemo,
      schedule: {
        wakeTime: '06:45',
        bedTime: '22:00',
        workStart: '08:30',
        workEnd: '17:30',
        commuteMode: 'remote',
        preferredExercise: 'none',
        outdoorGoals: 'Stay active',
      },
      role: 'general',
      hasSensitiveFamily: false,
    });

    expect(smogPlan.some((i) => i.category === 'family')).toBe(true);
    expect(smogPlan.find((i) => i.category === 'exercise')?.action).toContain('Postpone outdoor');
    expect(cleanPlan.some((i) => i.category === 'family')).toBe(false);
    expect(cleanPlan.some((i) => i.category === 'exercise')).toBe(false);
    expect(cleanPlan.find((i) => i.category === 'commute')?.action).toContain('Working remotely');
  });

  it('normalizes mixed-case and phrase categories/priorities from Gemini daily plan JSON', () => {
    const normalized = normalizeDailyPlanItems([
      { time: '07:00', title: 'Home Prep', category: 'Indoor Care', priority: 'High', action: 'Close windows' },
      { time: '08:30', title: 'Transit', category: 'Outdoor Activity', priority: 'LOW', action: 'Take metro' },
      { time: '18:00', title: 'Kids', category: 'Family Shield', priority: 'unknown', action: 'Indoor games' },
    ]);
    expect(normalized[0].category).toBe('indoor');
    expect(normalized[0].priority).toBe('high');
    expect(normalized[1].category).toBe('exercise');
    expect(normalized[1].priority).toBe('low');
    expect(normalized[2].category).toBe('family');
    expect(normalized[2].priority).toBe('medium');
  });

  it('generates indoor care plans respecting high outdoor AQI (>150) window restrictions', () => {
    const highSmogPlan = buildDemoIndoorCarePlan(
      {
        homeType: 'apartment',
        rooms: 3,
        sizeSqFt: 900,
        ventilationType: 'exhaust_fans',
        hasPurifier: false,
        filterType: 'none',
        cookingMethod: 'lpg_cylinder',
        hasPets: false,
        indoorSmokeExposure: false,
        dustLevel: 'high',
        humidityLevel: 'comfortable',
        budgetTier: '500',
      },
      DEMO_SCENARIOS[0].snapshot
    );
    expect(highSmogPlan.ventilationVerdict.toLowerCase()).toContain('closed');
    expect(highSmogPlan.rooms.length).toBeGreaterThanOrEqual(4);
    expect(highSmogPlan.budgetRecommendations.length).toBe(5);

    const budgetUpgrade = buildDemoBudgetUpgradeAi({
      profile: {
        homeType: 'apartment',
        rooms: 2,
        sizeSqFt: 650,
        ventilationType: 'natural_windows',
        hasPurifier: false,
        filterType: 'none',
        cookingMethod: 'piped_gas',
        hasPets: false,
        indoorSmokeExposure: false,
        dustLevel: 'moderate',
        humidityLevel: 'comfortable',
        budgetTier: '500',
      },
      snapshot: null,
    });
    expect(budgetUpgrade.budgetLabel).toBe('Under ₹500');
    expect(budgetUpgrade.prioritizedUpgrades.length).toBeGreaterThan(0);
    expect(budgetUpgrade.isDemoMock).toBe(true);
  });

  it('builds family, outdoor activity, explain-air, commute, and sustainability demo outputs safely even with null snapshot', () => {
    const family = buildDemoFamilyPlan({
      snapshot: DEMO_SCENARIOS[0].snapshot,
      standard: 'us_aqi',
      groups: [
        {
          label: 'Children',
          defaultPrecaution: 'Limit outdoor play above 100.',
          indoorAlt: 'Indoor board games.',
        },
      ],
    });
    expect(family.isDemoMock).toBe(true);
    expect(family.groupAdvice).toHaveLength(1);

    const outdoor = buildDemoOutdoorActivityAi({
      activityName: 'Running',
      intensity: 'High',
      indoorAltTitle: 'Indoor Yoga',
      indoorAltDetails: 'Stretch indoors',
      riskLevel: 'High',
      snapshot: DEMO_SCENARIOS[0].snapshot,
      standard: 'us_aqi',
    });
    expect(outdoor.riskAssessment).toBe('High');
    expect(outdoor.isDemoMock).toBe(true);

    const explain = buildDemoExplainAir('Why is PM2.5 high?', 'family', DEMO_SCENARIOS[0].snapshot);
    expect(explain.summary).toContain('households with children');
    expect(explain.isDemoMock).toBe(true);

    const commute = buildDemoCommuteAi({
      origin: 'Home',
      destination: 'Office',
      distanceKm: 6,
      mode: 'cycling',
      travelTime: 'morning_rush',
      snapshot: null,
      standard: 'us_aqi',
    });
    expect(commute.recommendedOption).toContain('6 km');
    expect(commute.isDemoMock).toBe(true);

    const sust = buildDemoSustainabilityAi({
      goals: [],
      snapshot: null,
      standard: 'us_aqi',
    });
    expect(sust.priorityActions.length).toBeGreaterThan(0);
    expect(sust.isDemoMock).toBe(true);
  });

  it('evaluates outdoor activity risk accurately and computes sustainability score', () => {
    const running = OUTDOOR_ACTIVITIES.find((a) => a.id === 'running')!;
    const severeEval = evaluateActivityGuidance(running, 'severe', 310);
    const goodEval = evaluateActivityGuidance(running, 'good', 25);
    expect(severeEval.riskLevel).toBe('High');
    expect(goodEval.riskLevel).toBe('Low');

    const result = calculateSustainabilityScore([
      { completedCount: 2, targetCount: 4, pointsPerAction: 25 },
      { completedCount: 1, targetCount: 3, pointsPerAction: 35 },
    ]);
    expect(result.score).toBe(85);
    expect(result.completedTotal).toBe(3);
    expect(result.targetTotal).toBe(7);
  });

  it('audits missing location / missing snapshot properly in AI context payload', () => {
    const ctx = buildAiContextPayload({
      snapshot: null,
      prefs: {
        onboardingCompleted: true,
        priorities: [],
        lifestyleRole: 'general',
        aqiStandard: 'us_aqi',
        tempUnit: 'C',
        demoMode: false,
        schedule: {
          wakeTime: '07:00',
          bedTime: '22:30',
          workStart: '09:00',
          workEnd: '17:00',
          commuteMode: 'walking',
          preferredExercise: 'walking',
          outdoorGoals: '',
        },
        household: [],
        budgetTier: '2000',
        accessibility: { highContrast: false, largeText: false, reducedMotion: false },
        notifications: {
          aqiThreshold: 120,
          quietStart: '22:00',
          quietEnd: '06:30',
          enableInAppAlerts: true,
          dailySummary: true,
          indoorTips: true,
        },
      },
    });
    expect(ctx.locationName).toBe('None selected');
    expect(ctx.currentAqi).toBeNull();
    const audited = normalizeAndAuditContext(ctx);
    expect(audited.dataGaps).toContain('No monitoring city or coordinates are selected yet.');
    expect(audited.dataGaps).toContain('Current AQI index reading is missing/unavailable.');
    expect(audited.dataGaps).toContain('Environmental reading timestamp is unavailable.');
  });
});

describe('Form Input Validators', () => {
  it('validates coordinates including boundary extremes and blank values', () => {
    expect(validateCoordinates('-90', '180').valid).toBe(true);
    expect(validateCoordinates('90', '-180').valid).toBe(true);
    expect(validateCoordinates('90.1', '10').valid).toBe(false);
    expect(validateCoordinates('10', '-180.1').valid).toBe(false);
    expect(validateCoordinates('abc', '10').valid).toBe(false);
    expect(validateCoordinates('', '').valid).toBe(false);
  });

  it('validates exposure logs, commute forms, sustainability goals, and community inputs', () => {
    expect(validateExposureLogInput({ activity: '  ', duration: 30, approxAqi: 100 }).valid).toBe(false);
    expect(validateExposureLogInput({ activity: 'Walk', duration: 0, approxAqi: 100 }).valid).toBe(false);
    expect(validateExposureLogInput({ activity: 'Walk', duration: 721, approxAqi: 100 }).valid).toBe(false);
    expect(validateExposureLogInput({ activity: 'Walk', duration: 30, approxAqi: -1 }).valid).toBe(false);
    expect(validateExposureLogInput({ activity: 'Walk', duration: 30, approxAqi: 501 }).valid).toBe(false);
    expect(validateExposureLogInput({ activity: 'Walk', duration: 29.6, approxAqi: 120.4 })).toEqual({
      valid: true,
      error: null,
      value: { activity: 'Walk', durationMinutes: 30, approximateAqi: 120 },
    });

    expect(validateCommuteInput({ origin: 'Home', destination: '', distanceKm: 5 }).valid).toBe(false);
    expect(validateCommuteInput({ origin: 'Home', destination: 'Work', distanceKm: 0.4 }).valid).toBe(false);
    expect(validateCommuteInput({ origin: 'Home', destination: 'Work', distanceKm: 101 }).valid).toBe(false);
    expect(validateCommuteInput({ origin: ' Home ', destination: ' Work ', distanceKm: 5 }).valid).toBe(true);

    expect(validateCustomGoalInput({ title: 'ab', targetCount: 3 }).valid).toBe(false);
    expect(validateCustomGoalInput({ title: 'Bike commute', targetCount: 99 })).toEqual({
      valid: true,
      error: null,
      value: { title: 'Bike commute', targetCount: 30 },
    });

    expect(validateCommunityInitiativeInput('hi').valid).toBe(false);
    expect(validateCommunityInitiativeInput('Clean School Zone').valid).toBe(true);
    expect(validatePollutionConcernInput('bad').valid).toBe(false);
    expect(validatePollutionConcernInput('Burning leaves near park gate').valid).toBe(true);
  });
});

describe('Context Auditing, Sustainability Edges & JSON Export Utility', () => {
  it('flags aging, stale, missing pollutants, weather gaps, and strips control chars in normalizeAndAuditContext', () => {
    const audited = normalizeAndAuditContext({
      locationName: '  Pune\u0007  ',
      isDemo: false,
      dataTimestampIso: '2026-11-20T05:00:00Z',
      freshnessStatus: 'stale',
      freshnessLabel: '6h old',
      currentAqi: 132.4,
      missingPollutants: ['O₃', 'SO₂'],
      weatherSummary: 'Temp n/a, Wind unavailable',
    });

    expect(audited.location).toBe('Pune');
    expect(audited.currentAqi).toBe(132);
    expect(audited.dataGaps.some((g) => g.includes('6h old'))).toBe(true);
    expect(audited.dataGaps.some((g) => g.includes('O₃, SO₂'))).toBe(true);
    expect(audited.dataGaps.some((g) => g.includes('weather parameters'))).toBe(true);
  });

  it('computes sustainability score accurately for empty arrays and over-target completions', () => {
    expect(calculateSustainabilityScore([])).toEqual({
      score: 0,
      completedTotal: 0,
      targetTotal: 0,
    });
    const extraActions = calculateSustainabilityScore([
      { completedCount: 8, targetCount: 4, pointsPerAction: 10 },
    ]);
    expect(extraActions.score).toBe(80);
    expect(extraActions.completedTotal).toBe(8);
    expect(extraActions.targetTotal).toBe(4);
  });
});

