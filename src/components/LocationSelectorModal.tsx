import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Loader2,
  MapPin,
  Navigation,
  Search,
  Star,
  X,
} from 'lucide-react';
import { DEMO_SCENARIOS } from '../data/demoData.ts';
import { searchLocationsApi } from '../services/apiClient.ts';
import type { LocationResult } from '../types/airQuality.ts';
import { validateCoordinates } from '../utils/validation.ts';

interface LocationSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLocation: LocationResult | null;
  favorites: LocationResult[];
  recent: LocationResult[];
  onSelectLiveLocation: (loc: LocationResult) => void;
  onSelectDemoScenario: (demoKey: string) => void;
  onToggleFavorite: (loc: LocationResult) => void;
}

export function LocationSelectorModal({
  isOpen,
  onClose,
  currentLocation,
  favorites,
  recent,
  onSelectLiveLocation,
  onSelectDemoScenario,
  onToggleFavorite,
}: LocationSelectorModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LocationResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [manualLat, setManualLat] = useState('');
  const [manualLon, setManualLon] = useState('');
  const [manualLabel, setManualLabel] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const t = setTimeout(() => searchInputRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
    if (previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearchError(null);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const list = await searchLocationsApi(trimmed, controller.signal);
        setResults(list);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setSearchError(
          err instanceof Error ? err.message : 'Unable to search cities right now.'
        );
      } finally {
        if (!controller.signal.aborted) {
          setSearching(false);
        }
      }
    }, 320);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isFavorite = (id: string) => favorites.some((f) => f.id === id);

  const handleUseGeolocation = () => {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError('Browser geolocation is not supported on this device. Search by city name instead.');
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLoading(false);
        onSelectLiveLocation({
          id: `geo-${pos.coords.latitude.toFixed(2)}-${pos.coords.longitude.toFixed(2)}`,
          name: 'Current Location',
          country: 'Device Geolocation',
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        onClose();
      },
      (err) => {
        setGeoLoading(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGeoError(
            'Location permission was denied. You can search for any city manually below without sharing device coordinates.'
          );
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setGeoError('Current position is unavailable. Please search for your city below.');
        } else {
          setGeoError('Location request timed out. Please search for a city manually.');
        }
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setManualError(null);
    const parsed = validateCoordinates(manualLat, manualLon);
    if (!parsed.valid || !parsed.value) {
      setManualError(parsed.error ?? 'Invalid coordinates.');
      return;
    }
    const { latitude: lat, longitude: lon } = parsed.value;
    onSelectLiveLocation({
      id: `manual-${lat.toFixed(3)}-${lon.toFixed(3)}`,
      name: manualLabel.trim() || `Coordinates ${lat.toFixed(2)}, ${lon.toFixed(2)}`,
      country: 'Custom Coordinates',
      latitude: lat,
      longitude: lon,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="location-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden shadow-xl">
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-200">
          <div>
            <h2 id="location-modal-title" className="text-lg font-semibold text-slate-900">
              Select City or Monitoring Location
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Search global cities via Open-Meteo Geocoding or explore labeled Demo Mode presets.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close location modal"
            className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
          {/* City search */}
          <div>
            <label htmlFor="city-search-input" className="block text-sm font-medium text-slate-800 mb-1.5">
              Search city or neighborhood
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search
                  className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  ref={searchInputRef}
                  id="city-search-input"
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g., New Delhi, London, Tokyo, Los Angeles..."
                  className="w-full pl-9 pr-10 py-2.5 min-h-[42px] text-sm border border-slate-300 rounded-lg focus:border-teal-700"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setResults([]);
                      searchInputRef.current?.focus();
                    }}
                    aria-label="Clear search"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-600 hover:text-slate-900 rounded-md"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handleUseGeolocation}
                disabled={geoLoading}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[42px] text-sm font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap shrink-0 disabled:opacity-60"
              >
                {geoLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Navigation className="w-4 h-4 text-teal-700" aria-hidden="true" />
                )}
                Use My Location
              </button>
            </div>

            {geoError && (
              <div
                role="alert"
                className="mt-2 flex items-start gap-2 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg p-2.5"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-700" aria-hidden="true" />
                <span>{geoError}</span>
              </div>
            )}

            {query.trim().length === 1 && (
              <p className="mt-2 text-xs text-slate-600">Type at least 2 characters to search.</p>
            )}

            {searching && (
              <div
                role="status"
                aria-live="polite"
                className="mt-3 flex items-center gap-2 text-xs text-slate-600"
              >
                <Loader2 className="w-4 h-4 animate-spin text-teal-700" aria-hidden="true" />
                Searching global locations...
              </div>
            )}

            {searchError && (
              <div
                role="alert"
                className="mt-3 flex items-start gap-2 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg p-3"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-700" aria-hidden="true" />
                <span>{searchError}</span>
              </div>
            )}

            {!searching && !searchError && query.trim().length >= 2 && results.length === 0 && (
              <p className="mt-3 text-xs text-slate-600">
                No matching cities found for “{query}”. Try a broader city name or use coordinates below.
              </p>
            )}

            {results.length > 0 && (
              <ul
                className="mt-3 border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-52 overflow-y-auto"
                aria-label="City search results"
              >
                {results.map((loc) => (
                  <li key={loc.id} className="flex items-center justify-between px-3 py-2 hover:bg-slate-50">
                    <button
                      type="button"
                      onClick={() => {
                        onSelectLiveLocation(loc);
                        onClose();
                      }}
                      className="flex-1 text-left flex items-center gap-2.5 min-w-0 py-1.5"
                    >
                      <MapPin className="w-4 h-4 text-teal-700 shrink-0" aria-hidden="true" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">
                          {loc.name}
                          {loc.admin1 ? `, ${loc.admin1}` : ''}
                        </div>
                        <div className="text-xs text-slate-600">
                          {loc.country} · {loc.latitude.toFixed(2)}°, {loc.longitude.toFixed(2)}°
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(loc)}
                      aria-pressed={isFavorite(loc.id)}
                      aria-label={isFavorite(loc.id) ? `Remove ${loc.name} from favorites` : `Save ${loc.name} to favorites`}
                      className="p-2 min-w-[38px] min-h-[38px] flex items-center justify-center text-slate-600 hover:text-amber-600 rounded-lg"
                    >
                      <Star
                        aria-hidden="true"
                        className={`w-4 h-4 ${
                          isFavorite(loc.id) ? 'fill-amber-400 text-amber-600' : ''
                        }`}
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Favorites & Recent */}
          {(favorites.length > 0 || recent.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
              {favorites.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">
                    Saved Favorites
                  </h3>
                  <div className="space-y-1.5">
                    {favorites.map((loc) => (
                      <div
                        key={loc.id}
                        className="flex items-center justify-between px-3 py-1.5 min-h-[40px] rounded-lg border border-slate-200 hover:bg-slate-50"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onSelectLiveLocation(loc);
                            onClose();
                          }}
                          className="text-left text-xs font-medium text-slate-800 truncate flex-1 py-1"
                        >
                          {loc.name}
                          {loc.country ? ` · ${loc.country}` : ''}
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleFavorite(loc)}
                          aria-label={`Remove ${loc.name} from favorites`}
                          className="ml-2 p-1.5 text-amber-600 hover:text-slate-700 rounded"
                        >
                          <Star className="w-3.5 h-3.5 fill-amber-400" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {recent.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">
                    Recent Locations
                  </h3>
                  <div className="space-y-1.5">
                    {recent.slice(0, 4).map((loc) => (
                      <button
                        key={loc.id}
                        type="button"
                        onClick={() => {
                          onSelectLiveLocation(loc);
                          onClose();
                        }}
                        className={`w-full text-left px-3 py-2 min-h-[40px] rounded-lg border text-xs font-medium truncate ${
                          currentLocation?.id === loc.id
                            ? 'border-teal-600 bg-teal-50 text-teal-950'
                            : 'border-slate-200 text-slate-800 hover:bg-slate-50'
                        }`}
                      >
                        {loc.name}
                        {loc.country ? ` · ${loc.country}` : ''}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Demo presets */}
          <div className="pt-4 border-t border-slate-100">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">
              Demo Mode Scenarios (Simulated Data — Works Offline / Without Keys)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {DEMO_SCENARIOS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => {
                    onSelectDemoScenario(preset.key);
                    onClose();
                  }}
                  className="text-left px-3.5 py-2.5 min-h-[44px] rounded-lg border border-slate-200 hover:border-slate-400 hover:bg-slate-50 transition-colors"
                >
                  <div className="text-xs font-semibold text-slate-900">{preset.label}</div>
                  <div className="text-[11px] text-slate-600 mt-0.5">
                    Simulated dataset · AQI {preset.snapshot.currentUsAqi}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Manual coordinates */}
          <form onSubmit={handleManualSubmit} className="pt-4 border-t border-slate-100">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">
              Enter Coordinates Manually
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <input
                type="text"
                value={manualLabel}
                onChange={(e) => setManualLabel(e.target.value)}
                placeholder="Label (optional)"
                aria-label="Custom location label"
                className="px-3 py-2 min-h-[40px] text-xs border border-slate-300 rounded-lg"
              />
              <input
                type="number"
                step="any"
                value={manualLat}
                aria-invalid={Boolean(manualError)}
                aria-describedby={manualError ? 'manual-coord-error' : undefined}
                onChange={(e) => {
                  setManualLat(e.target.value);
                  if (manualError) setManualError(null);
                }}
                placeholder="Latitude (e.g. 28.61)"
                aria-label="Latitude"
                className="px-3 py-2 min-h-[40px] text-xs border border-slate-300 rounded-lg font-mono"
              />
              <input
                type="number"
                step="any"
                value={manualLon}
                aria-invalid={Boolean(manualError)}
                aria-describedby={manualError ? 'manual-coord-error' : undefined}
                onChange={(e) => {
                  setManualLon(e.target.value);
                  if (manualError) setManualError(null);
                }}
                placeholder="Longitude (e.g. 77.21)"
                aria-label="Longitude"
                className="px-3 py-2 min-h-[40px] text-xs border border-slate-300 rounded-lg font-mono"
              />
              <button
                type="submit"
                className="px-3 py-2 min-h-[40px] text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg whitespace-nowrap"
              >
                Load Coordinates
              </button>
            </div>
            {manualError && (
              <p id="manual-coord-error" role="alert" className="mt-1.5 text-xs text-red-700">
                {manualError}
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
