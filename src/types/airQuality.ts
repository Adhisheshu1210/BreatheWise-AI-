export type AqiStandard = 'us_aqi' | 'eaqi';

export type AqiCategoryId =
  | 'good'
  | 'moderate'
  | 'sensitive'
  | 'poor'
  | 'very_poor'
  | 'severe';

export type PollutantCode = 'pm2_5' | 'pm10' | 'no2' | 'o3' | 'so2' | 'co';

export interface LocationResult {
  id: string;
  name: string;
  admin1?: string;
  country: string;
  countryCode?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
  population?: number;
}

export interface AqiCategoryMeta {
  id: AqiCategoryId;
  label: string;
  shortLabel: string;
  summary: string;
  outdoorGuidance: string;
  ventilationGuidance: string;
  colorHex: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  badgeTextClass: string;
}

export interface PollutantReading {
  code: PollutantCode;
  label: string;
  fullName: string;
  value: number | null;
  unit: string;
  whoBenchmark: number;
  whoPeriod: string;
  plainExplanation: string;
  actionTip: string;
  benchmarkRatio: number | null;
}

export interface TrendPoint {
  timestamp: string;
  label: string;
  usAqi: number | null;
  eaqi: number | null;
  pm2_5: number | null;
  pm10: number | null;
  no2: number | null;
  o3: number | null;
}

export interface WeatherContext {
  temperatureC: number | null;
  humidityPercent: number | null;
  windSpeedKmh: number | null;
  surfacePressureHpa: number | null;
  observedAt: string | null;
}

export interface EnvironmentalAlert {
  id: string;
  severity: 'info' | 'warning' | 'elevated' | 'severe';
  category: 'aqi' | 'spike' | 'ventilation' | 'activity';
  title: string;
  message: string;
  recommendedAction: string;
  basedOn: string;
}

export interface AirQualitySnapshot {
  location: LocationResult;
  isDemo: boolean;
  dataSource: string;
  attribution: string;
  currentUsAqi: number | null;
  currentEaqi: number | null;
  primaryPollutant: PollutantCode | null;
  lastUpdatedIso: string;
  fetchedAtIso: string;
  freshnessStatus: 'fresh' | 'recent' | 'aging' | 'stale' | 'demo';
  freshnessLabel: string;
  pollutants: PollutantReading[];
  weather: WeatherContext;
  hourly24h: TrendPoint[];
  daily7d: TrendPoint[];
  historical30dAvailable: boolean;
  historical30dNote: string;
  sample30dTrend: TrendPoint[];
  alerts: EnvironmentalAlert[];
}

export interface GridStationPoint {
  id: string;
  label: string;
  direction: string;
  distanceKm: number;
  latitude: number;
  longitude: number;
  usAqi: number | null;
  eaqi: number | null;
  pm2_5: number | null;
  pm10: number | null;
  no2: number | null;
  dominantPollutant: PollutantCode | null;
}

export type NavSection =
  | 'dashboard'
  | 'map'
  | 'planner'
  | 'indoor'
  | 'sustainability'
  | 'exposure'
  | 'assistant'
  | 'family'
  | 'commute'
  | 'community'
  | 'education'
  | 'notifications'
  | 'settings';

export type LifestyleRole =
  | 'general'
  | 'student'
  | 'office_worker'
  | 'outdoor_worker'
  | 'parent'
  | 'senior';

export type HouseholdGroupId =
  | 'adults'
  | 'children'
  | 'older_adults'
  | 'respiratory_sensitive'
  | 'outdoor_workers'
  | 'pets';

export interface HouseholdMemberProfile {
  id: string;
  group: HouseholdGroupId;
  nickname: string;
  notes?: string;
}

export interface DailySchedulePrefs {
  wakeTime: string;
  bedTime: string;
  workStart: string;
  workEnd: string;
  commuteMode: 'walking' | 'cycling' | 'public_transit' | 'carpool' | 'private_car' | 'remote';
  preferredExercise: 'running' | 'walking' | 'cycling' | 'yoga' | 'gym_indoor' | 'none';
  outdoorGoals: string;
}

export interface UserPreferences {
  onboardingCompleted: boolean;
  priorities: string[];
  lifestyleRole: LifestyleRole;
  aqiStandard: AqiStandard;
  tempUnit: 'C' | 'F';
  demoMode: boolean;
  schedule: DailySchedulePrefs;
  household: HouseholdMemberProfile[];
  budgetTier: '0' | '500' | '2000' | '5000' | '5000+';
  accessibility: {
    highContrast: boolean;
    largeText: boolean;
    reducedMotion: boolean;
  };
  notifications: {
    aqiThreshold: number;
    quietStart: string;
    quietEnd: string;
    enableInAppAlerts: boolean;
    dailySummary: boolean;
    indoorTips: boolean;
  };
}

export interface DailyPlanItem {
  id: string;
  time: string;
  title: string;
  category: 'monitoring' | 'commute' | 'exercise' | 'indoor' | 'family' | 'ventilation';
  priority: 'high' | 'medium' | 'low';
  action: string;
  alternative: string;
  explanation: string;
  completed: boolean;
  isAiGenerated: boolean;
}

export interface IndoorHomeProfile {
  homeType: 'apartment' | 'independent_house' | 'shared_flat';
  rooms: number;
  sizeSqFt: number;
  ventilationType: 'natural_windows' | 'exhaust_fans' | 'central_hvac' | 'mixed';
  hasPurifier: boolean;
  filterType: 'none' | 'hepa_h13' | 'activated_carbon' | 'basic_mesh' | 'unknown';
  cookingMethod: 'induction_electric' | 'piped_gas' | 'lpg_cylinder' | 'solid_fuel';
  hasPets: boolean;
  indoorSmokeExposure: boolean;
  dustLevel: 'low' | 'moderate' | 'high';
  humidityLevel: 'dry' | 'comfortable' | 'humid';
  budgetTier: '0' | '500' | '2000' | '5000' | '5000+';
}

export interface IndoorRecommendationItem {
  title: string;
  category: string;
  priority: 'high' | 'medium' | 'low';
  action: string;
  explanation: string;
  estimatedEffort: string;
  estimatedCost: string;
  impactDescription: string;
  confidenceOrLimitation: string;
  suggestedTime: string;
  sourceType: 'evidence_supported' | 'ai_generated';
}

export interface IndoorCarePlan {
  summary: string;
  ventilationVerdict: string;
  rooms: Array<{
    room: 'Bedroom' | 'Living Room' | 'Kitchen' | 'Study Room' | "Children's Room";
    priorityAction: string;
    details: string;
  }>;
  checklists: {
    daily: string[];
    weekly: string[];
    monthly: string[];
  };
  budgetRecommendations: Array<{
    tier: '₹0 Budget' | 'Under ₹500' | 'Under ₹2,000' | 'Under ₹5,000' | 'Higher-Budget';
    items: string[];
  }>;
  structuredItems: IndoorRecommendationItem[];
  disclaimer: string;
}

export interface ExposureLogEntry {
  id: string;
  dateIso: string;
  timeOfDay: string;
  locationName: string;
  activity: string;
  durationMinutes: number;
  approximateAqi: number;
  aqiStandard: AqiStandard;
  transportMode: string;
  usedMask: boolean;
  maskType?: string;
  notes: string;
}

export interface SustainabilityGoal {
  id: string;
  title: string;
  category: 'transportation' | 'energy' | 'cooking' | 'waste' | 'shopping' | 'water' | 'outdoor';
  difficulty: 'easy' | 'moderate' | 'committed';
  cadence: 'daily' | 'weekly';
  targetCount: number;
  completedCount: number;
  pointsPerAction: number;
  estimatedCo2RangeKg: [number, number];
  methodologyNote: string;
}

export interface CommunityInitiative {
  id: string;
  title: string;
  category: 'walking_bus' | 'carpool' | 'awareness' | 'clean_air_zone' | 'concern_report';
  neighborhood: string;
  description: string;
  participantsCount: number;
  joinedByMe: boolean;
  checklist: Array<{ id: string; label: string; done: boolean }>;
  createdAtIso: string;
  isLocalDraft: boolean;
}

export interface NotificationEntry {
  id: string;
  timestampIso: string;
  type: 'aqi_alert' | 'spike' | 'daily_summary' | 'planner' | 'indoor' | 'sustainability';
  severity: 'info' | 'warning' | 'elevated' | 'severe';
  title: string;
  body: string;
  locationName: string;
  read: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestampIso: string;
  isDemoResponse?: boolean;
  isError?: boolean;
  contextSnapshotLabel?: string;
}

export interface ExplainAirResult {
  question: string;
  mode: 'beginner' | 'detailed' | 'family';
  summary: string;
  reasoning: string;
  practicalActions: string[];
  uncertaintyDisclosure: string;
  followUpQuestions: string[];
  isAiGenerated: boolean;
  isDemoMock?: boolean;
}

export type AiRecommendationTaskType =
  | 'daily-plan'
  | 'family-protection'
  | 'indoor-care'
  | 'outdoor-activity'
  | 'explain-air'
  | 'sustainability-plan'
  | 'commute-advice'
  | 'budget-home-upgrade';

export interface AiContextPayload {
  locationName: string;
  coordinates?: string;
  isDemo: boolean;
  dataSource: string;
  dataTimestampIso: string | null;
  freshnessStatus: AirQualitySnapshot['freshnessStatus'] | 'unavailable';
  freshnessLabel: string;
  aqiStandard: string;
  currentAqi: number | null;
  categoryLabel: string;
  primaryPollutant: string | null;
  pollutantsSummary: string;
  missingPollutants: string[];
  weatherSummary: string;
  hourlyWindowSummary: string;
  lifestyleRole: string;
  priorities: string[];
  scheduleSummary: string;
  householdSummary: string;
  budgetTier: string;
  indoorSummary: string;
  sustainabilitySummary: string;
  recentExposureSummary: string;
}

export interface OutdoorActivityAiResult {
  verdict: string;
  riskAssessment: 'Low' | 'Moderate' | 'Elevated' | 'High';
  bestTimeWindow: string;
  breathingPrecautions: string[];
  indoorAlternativePlan: string;
  whyBasedOnReadings: string;
  dataLimitationNote: string;
  isAiGenerated: boolean;
  isDemoMock?: boolean;
}

export interface SustainabilityAiResult {
  weeklyFocus: string;
  impactSummary: string;
  priorityActions: Array<{
    title: string;
    whyItMatters: string;
    practicalStep: string;
    cadence: string;
  }>;
  habitSynergies: string[];
  dataLimitationNote: string;
  isAiGenerated: boolean;
  isDemoMock?: boolean;
}

export interface CommuteAiResult {
  recommendedOption: string;
  timingAdjustment: string;
  exposureReductionSteps: string[];
  gearChecklist: string[];
  tradeOffSummary: string;
  dataLimitationNote: string;
  isAiGenerated: boolean;
  isDemoMock?: boolean;
}

export interface FamilyAiResult {
  overview: string;
  morningChecklist: string[];
  eveningChecklist: string[];
  schoolCommuteGuidance: string;
  groupAdvice: Array<{
    group: string;
    precaution: string;
    indoorAlternative: string;
  }>;
  dataLimitationNote?: string;
  isDemoMock?: boolean;
}

export interface BudgetHomeUpgradeAiResult {
  budgetLabel: string;
  strategySummary: string;
  prioritizedUpgrades: Array<{
    item: string;
    approxCostRange: string;
    reasonForThisHome: string;
    expectedBenefit: string;
    limitation: string;
  }>;
  skipForNow: string[];
  dataLimitationNote: string;
  isAiGenerated: boolean;
  isDemoMock?: boolean;
}

