export const SCHEDULE_COMMUTE_MODES = [
  'walking',
  'cycling',
  'public_transit',
  'carpool',
  'private_car',
  'remote',
] as const;

export const SCHEDULE_EXERCISES = [
  'running',
  'walking',
  'cycling',
  'yoga',
  'gym_indoor',
  'none',
] as const;

export const AQI_STANDARDS = ['us_aqi', 'eaqi'] as const;

export const LIFESTYLE_ROLES = [
  'general',
  'student',
  'office_worker',
  'outdoor_worker',
  'parent',
  'senior',
] as const;

export const HOUSEHOLD_GROUP_IDS = [
  'adults',
  'children',
  'older_adults',
  'respiratory_sensitive',
  'outdoor_workers',
  'pets',
] as const;

export const HOME_TYPES = ['apartment', 'independent_house', 'shared_flat'] as const;

export const BUDGET_TIERS = ['0', '500', '2000', '5000', '5000+'] as const;

export const VENTILATION_TYPES = [
  'natural_windows',
  'exhaust_fans',
  'central_hvac',
  'mixed',
] as const;

export const COOKING_METHODS = [
  'induction_electric',
  'piped_gas',
  'lpg_cylinder',
  'solid_fuel',
] as const;

export const FILTER_TYPES = [
  'none',
  'hepa_h13',
  'activated_carbon',
  'basic_mesh',
  'unknown',
] as const;

export const DUST_LEVELS = ['low', 'moderate', 'high'] as const;

export const HUMIDITY_LEVELS = ['dry', 'comfortable', 'humid'] as const;

export const SUSTAINABILITY_CATEGORIES = [
  'transportation',
  'energy',
  'cooking',
  'waste',
  'shopping',
  'water',
  'outdoor',
] as const;

export const SUSTAINABILITY_DIFFICULTIES = ['easy', 'moderate', 'committed'] as const;

export const SUSTAINABILITY_CADENCES = ['daily', 'weekly'] as const;

export const COMMUNITY_FORM_CATEGORIES = [
  'carpool',
  'walking_bus',
  'awareness',
  'clean_air_zone',
] as const;
