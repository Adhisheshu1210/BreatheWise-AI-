import { Home } from 'lucide-react';
import type { IndoorHomeProfile } from '../types/airQuality.ts';
import {
  BUDGET_TIERS,
  COOKING_METHODS,
  DUST_LEVELS,
  FILTER_TYPES,
  HOME_TYPES,
  HUMIDITY_LEVELS,
  VENTILATION_TYPES,
} from '../utils/options.ts';
import { clampNumber, parseOptionValue } from '../utils/validation.ts';

interface IndoorHomeProfileFormProps {
  homeProfile: IndoorHomeProfile;
  onUpdateHomeProfile: (next: IndoorHomeProfile) => void;
}

export function IndoorHomeProfileForm({
  homeProfile,
  onUpdateHomeProfile,
}: IndoorHomeProfileFormProps) {
  return (
    <div className="lg:col-span-4 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3.5">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Home className="w-4 h-4 text-teal-700" aria-hidden="true" />
        Describe Your Home
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="home-type" className="block text-xs font-medium text-slate-700 mb-1">
            Home Type
          </label>
          <select
            id="home-type"
            value={homeProfile.homeType}
            onChange={(e) =>
              onUpdateHomeProfile({
                ...homeProfile,
                homeType: parseOptionValue(e.target.value, HOME_TYPES, 'apartment'),
              })
            }
            className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="apartment">Apartment</option>
            <option value="independent_house">Independent House</option>
            <option value="shared_flat">Shared Flat</option>
          </select>
        </div>
        <div>
          <label htmlFor="home-rooms" className="block text-xs font-medium text-slate-700 mb-1">
            Rooms
          </label>
          <input
            id="home-rooms"
            type="number"
            min={1}
            max={15}
            value={homeProfile.rooms}
            onChange={(e) =>
              onUpdateHomeProfile({
                ...homeProfile,
                rooms: Math.round(clampNumber(Number(e.target.value), 1, 15, 1)),
              })
            }
            className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white font-mono"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="home-size" className="block text-xs font-medium text-slate-700 mb-1">
            Approx. Size (sq ft)
          </label>
          <input
            id="home-size"
            type="number"
            min={150}
            max={10000}
            step={50}
            value={homeProfile.sizeSqFt}
            onChange={(e) =>
              onUpdateHomeProfile({
                ...homeProfile,
                sizeSqFt: Math.round(clampNumber(Number(e.target.value), 150, 10000, 500)),
              })
            }
            className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white font-mono"
          />
        </div>
        <div>
          <label htmlFor="home-budget" className="block text-xs font-medium text-slate-700 mb-1">
            Budget Tier
          </label>
          <select
            id="home-budget"
            value={homeProfile.budgetTier}
            onChange={(e) =>
              onUpdateHomeProfile({
                ...homeProfile,
                budgetTier: parseOptionValue(e.target.value, BUDGET_TIERS, '2000'),
              })
            }
            className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="0">₹0 budget</option>
            <option value="500">Under ₹500</option>
            <option value="2000">Under ₹2,000</option>
            <option value="5000">Under ₹5,000</option>
            <option value="5000+">Higher-budget</option>
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="home-ventilation" className="block text-xs font-medium text-slate-700 mb-1">
          Ventilation Setup
        </label>
        <select
          id="home-ventilation"
          value={homeProfile.ventilationType}
          onChange={(e) =>
            onUpdateHomeProfile({
              ...homeProfile,
              ventilationType: parseOptionValue(
                e.target.value,
                VENTILATION_TYPES,
                'natural_windows'
              ),
            })
          }
          className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
        >
          <option value="natural_windows">Natural window ventilation</option>
          <option value="exhaust_fans">Kitchen/bath exhaust fans + windows</option>
          <option value="central_hvac">Central HVAC / AC filtration</option>
          <option value="mixed">Mixed ventilation</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="home-cooking" className="block text-xs font-medium text-slate-700 mb-1">
            Cooking Method
          </label>
          <select
            id="home-cooking"
            value={homeProfile.cookingMethod}
            onChange={(e) =>
              onUpdateHomeProfile({
                ...homeProfile,
                cookingMethod: parseOptionValue(e.target.value, COOKING_METHODS, 'piped_gas'),
              })
            }
            className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="piped_gas">Piped Gas</option>
            <option value="lpg_cylinder">LPG Cylinder</option>
            <option value="induction_electric">Electric / Induction</option>
            <option value="solid_fuel">Wood / Biomass / Coal</option>
          </select>
        </div>
        <div>
          <label htmlFor="home-filter" className="block text-xs font-medium text-slate-700 mb-1">
            Purifier Filter
          </label>
          <select
            id="home-filter"
            value={homeProfile.filterType}
            onChange={(e) => {
              const filterType = parseOptionValue(e.target.value, FILTER_TYPES, 'none');
              onUpdateHomeProfile({
                ...homeProfile,
                hasPurifier: filterType !== 'none',
                filterType,
              });
            }}
            className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="none">No air purifier</option>
            <option value="hepa_h13">True HEPA (H13/H14)</option>
            <option value="activated_carbon">HEPA + Activated Carbon</option>
            <option value="basic_mesh">Basic dust mesh only</option>
            <option value="unknown">Purifier (filter unknown)</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="home-dust" className="block text-xs font-medium text-slate-700 mb-1">
            Dust Level
          </label>
          <select
            id="home-dust"
            value={homeProfile.dustLevel}
            onChange={(e) =>
              onUpdateHomeProfile({
                ...homeProfile,
                dustLevel: parseOptionValue(e.target.value, DUST_LEVELS, 'moderate'),
              })
            }
            className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="low">Low</option>
            <option value="moderate">Moderate</option>
            <option value="high">High (roadside/construction)</option>
          </select>
        </div>
        <div>
          <label htmlFor="home-humidity" className="block text-xs font-medium text-slate-700 mb-1">
            Humidity
          </label>
          <select
            id="home-humidity"
            value={homeProfile.humidityLevel}
            onChange={(e) =>
              onUpdateHomeProfile({
                ...homeProfile,
                humidityLevel: parseOptionValue(e.target.value, HUMIDITY_LEVELS, 'comfortable'),
              })
            }
            className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="dry">Dry</option>
            <option value="comfortable">Comfortable</option>
            <option value="humid">Humid / Damp</option>
          </select>
        </div>
      </div>

      <div className="space-y-2.5 pt-1 text-xs">
        <label className="flex items-center gap-2.5 py-1 text-slate-800 cursor-pointer">
          <input
            type="checkbox"
            checked={homeProfile.hasPets}
            onChange={(e) => onUpdateHomeProfile({ ...homeProfile, hasPets: e.target.checked })}
            className="rounded border-slate-300 w-4 h-4 accent-teal-700"
          />
          Indoor pets present
        </label>
        <label className="flex items-center gap-2.5 py-1 text-slate-800 cursor-pointer">
          <input
            type="checkbox"
            checked={homeProfile.indoorSmokeExposure}
            onChange={(e) =>
              onUpdateHomeProfile({
                ...homeProfile,
                indoorSmokeExposure: e.target.checked,
              })
            }
            className="rounded border-slate-300 w-4 h-4 accent-teal-700"
          />
          Indoor smoke, incense, or coil exposure
        </label>
      </div>
    </div>
  );
}
