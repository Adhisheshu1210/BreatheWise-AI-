export interface ValidationResult<T = undefined> {
  valid: boolean;
  error: string | null;
  value?: T;
}

export function validateCoordinates(
  latRaw: string,
  lonRaw: string
): ValidationResult<{ latitude: number; longitude: number }> {
  const latStr = latRaw.trim();
  const lonStr = lonRaw.trim();
  const lat = Number(latStr);
  const lon = Number(lonStr);

  if (
    !latStr ||
    !lonStr ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return {
      valid: false,
      error: 'Enter valid coordinates: latitude (-90 to 90) and longitude (-180 to 180).',
    };
  }

  return { valid: true, error: null, value: { latitude: lat, longitude: lon } };
}

export function validateExposureLogInput(params: {
  activity: string;
  duration: number;
  approxAqi: number;
}): ValidationResult<{ activity: string; durationMinutes: number; approximateAqi: number }> {
  const activity = params.activity.trim();
  if (!activity) {
    return { valid: false, error: 'Please enter an activity name.' };
  }
  if (!Number.isFinite(params.duration) || params.duration < 1 || params.duration > 720) {
    return { valid: false, error: 'Duration must be between 1 and 720 minutes.' };
  }
  if (!Number.isFinite(params.approxAqi) || params.approxAqi < 0 || params.approxAqi > 500) {
    return { valid: false, error: 'Approximate AQI must be between 0 and 500.' };
  }
  return {
    valid: true,
    error: null,
    value: {
      activity,
      durationMinutes: Math.round(params.duration),
      approximateAqi: Math.round(params.approxAqi),
    },
  };
}

export function validateCommuteInput(params: {
  origin: string;
  destination: string;
  distanceKm: number;
}): ValidationResult<{ origin: string; destination: string; distanceKm: number }> {
  const origin = params.origin.trim();
  const destination = params.destination.trim();
  if (!origin || !destination) {
    return { valid: false, error: 'Enter both a starting point and destination.' };
  }
  if (!Number.isFinite(params.distanceKm) || params.distanceKm < 0.5 || params.distanceKm > 100) {
    return {
      valid: false,
      error: 'Distance must be between 0.5 and 100 km (showing fallback 1 km).',
    };
  }
  return {
    valid: true,
    error: null,
    value: { origin, destination, distanceKm: params.distanceKm },
  };
}

export function validateCustomGoalInput(params: {
  title: string;
  targetCount: number;
}): ValidationResult<{ title: string; targetCount: number }> {
  const title = params.title.trim();
  if (title.length < 3) {
    return {
      valid: false,
      error: 'Please enter a goal description (at least 3 characters).',
    };
  }
  const targetCount = Math.min(30, Math.max(1, Math.round(params.targetCount || 1)));
  return { valid: true, error: null, value: { title, targetCount } };
}

export function validateCommunityInitiativeInput(title: string): ValidationResult<string> {
  const trimmed = title.trim();
  if (trimmed.length < 3) {
    return {
      valid: false,
      error: 'Please enter an initiative title (at least 3 characters).',
    };
  }
  return { valid: true, error: null, value: trimmed };
}

export function validatePollutionConcernInput(note: string): ValidationResult<string> {
  const trimmed = note.trim();
  if (trimmed.length < 5) {
    return {
      valid: false,
      error: 'Please describe the location and observation (at least 5 characters).',
    };
  }
  return { valid: true, error: null, value: trimmed };
}
