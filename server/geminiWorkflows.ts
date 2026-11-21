import { Type, type Schema } from '@google/genai';
import { normalizePlanCategory, normalizePlanPriority } from '../src/utils/aqi.ts';
import {
  GeminiServiceError,
  isPlainRecord,
  type RecommendationTaskType,
  sanitizeShortString,
  sanitizeStringArray,
} from './geminiUtils.ts';

export interface StructuredWorkflowSpec {
  malformedErrorMessage: string;
  buildPrompt: (contextStr: string, payloadStr: string) => string;
  responseSchema: Schema;
  normalizeAndValidate: (parsed: Record<string, unknown>) => unknown;
}

export const STRUCTURED_WORKFLOWS: Record<RecommendationTaskType, StructuredWorkflowSpec> = {
  'daily-plan': {
    malformedErrorMessage: 'Daily plan response was malformed.',
    buildPrompt: (contextStr, payloadStr) => `Verified Context: ${contextStr}
Schedule & Priorities Payload: ${payloadStr}

Workflow 1 — Daily Clean-Air Planning:
Generate a practical, chronological daily routine of 5 to 6 items tailored strictly to the user's exact wake/work/bed times, commute mode, preferred exercise, indoor setup, household members, sustainability focus, current AQI, 24h lowest/peak window, and timestamp.
- Use "category" strictly from ["monitoring","commute","exercise","indoor","family","ventilation"].
- Use "priority" strictly from ["high","medium","low"].
- Include "planSummary" (1–2 crisp sentences referencing location + AQI) and "dataLimitationNote" explicitly noting any dataGaps (or hyperlocal street-variation caveat if no dataGaps exist).`,
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        planSummary: { type: Type.STRING },
        dataLimitationNote: { type: Type.STRING },
        items: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              time: { type: Type.STRING },
              title: { type: Type.STRING },
              category: { type: Type.STRING },
              priority: { type: Type.STRING },
              action: { type: Type.STRING },
              alternative: { type: Type.STRING },
              explanation: { type: Type.STRING },
            },
            required: [
              'time',
              'title',
              'category',
              'priority',
              'action',
              'alternative',
              'explanation',
            ],
          },
        },
      },
      required: ['planSummary', 'dataLimitationNote', 'items'],
    },
    normalizeAndValidate: (parsed) => {
      const planSummary = sanitizeShortString(parsed.planSummary, 400);
      const items = Array.isArray(parsed.items)
        ? parsed.items
            .slice(0, 8)
            .filter(isPlainRecord)
            .map((it) => ({
              time: sanitizeShortString(it.time, 30) || '09:00',
              title: sanitizeShortString(it.title, 140),
              category: normalizePlanCategory(it.category),
              priority: normalizePlanPriority(it.priority),
              action: sanitizeShortString(it.action, 360),
              alternative:
                sanitizeShortString(it.alternative, 300) || 'Move indoors if air worsens.',
              explanation:
                sanitizeShortString(it.explanation, 360) || 'Adapted to local conditions.',
            }))
            .filter((it) => it.title.length > 0 && it.action.length > 0)
        : [];
      if (!planSummary || items.length === 0) {
        throw new GeminiServiceError(
          'AI_INVALID_RESPONSE',
          'Daily plan response was incomplete.',
          502
        );
      }
      return {
        planSummary,
        dataLimitationNote: sanitizeShortString(parsed.dataLimitationNote, 400),
        items,
      };
    },
  },

  'family-protection': {
    malformedErrorMessage: 'Family guidance response was malformed.',
    buildPrompt: (contextStr, payloadStr) => `Verified Context: ${contextStr}
Household Profiles Payload: ${payloadStr}

Workflow 2 — Family Protection:
Provide calm, non-diagnostic protection guidance tailored to each listed household group, current AQI/pollutants, timestamp/freshness, and indoor setup. Never claim to predict or prevent medical emergencies. Include an explicit "dataLimitationNote" acknowledging any dataGaps or hyperlocal caveats.`,
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        overview: { type: Type.STRING },
        morningChecklist: { type: Type.ARRAY, items: { type: Type.STRING } },
        eveningChecklist: { type: Type.ARRAY, items: { type: Type.STRING } },
        schoolCommuteGuidance: { type: Type.STRING },
        groupAdvice: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              group: { type: Type.STRING },
              precaution: { type: Type.STRING },
              indoorAlternative: { type: Type.STRING },
            },
            required: ['group', 'precaution', 'indoorAlternative'],
          },
        },
        dataLimitationNote: { type: Type.STRING },
      },
      required: [
        'overview',
        'morningChecklist',
        'eveningChecklist',
        'schoolCommuteGuidance',
        'groupAdvice',
        'dataLimitationNote',
      ],
    },
    normalizeAndValidate: (parsed) => {
      const overview = sanitizeShortString(parsed.overview, 600);
      const morningChecklist = sanitizeStringArray(parsed.morningChecklist, 6, 220);
      const eveningChecklist = sanitizeStringArray(parsed.eveningChecklist, 6, 220);
      const groupAdvice = Array.isArray(parsed.groupAdvice)
        ? parsed.groupAdvice
            .slice(0, 8)
            .filter(isPlainRecord)
            .map((g) => ({
              group: sanitizeShortString(g.group, 80) || 'Household',
              precaution: sanitizeShortString(g.precaution, 340),
              indoorAlternative: sanitizeShortString(g.indoorAlternative, 300),
            }))
            .filter((g) => g.precaution.length > 0)
        : [];
      if (!overview || groupAdvice.length === 0 || morningChecklist.length === 0) {
        throw new GeminiServiceError(
          'AI_INVALID_RESPONSE',
          'Family guidance response was incomplete.',
          502
        );
      }
      return {
        overview,
        morningChecklist,
        eveningChecklist,
        schoolCommuteGuidance: sanitizeShortString(parsed.schoolCommuteGuidance, 450),
        groupAdvice,
        dataLimitationNote: sanitizeShortString(parsed.dataLimitationNote, 400),
      };
    },
  },

  'indoor-care': {
    malformedErrorMessage: 'Indoor care plan response was malformed.',
    buildPrompt: (contextStr, payloadStr) => `Verified Context: ${contextStr}
Home Profile Payload: ${payloadStr}

Workflow 3 — Indoor Air Improvement:
Create a tailored room-by-room indoor air improvement plan matching the exact home type, sq ft, room count, ventilation, cooking fuel, purifier filter type, dust, humidity, pets, smoke exposure, and outdoor AQI + hourly window.
- Never suggest opening exterior windows if outdoor AQI is > 150 (Poor/Very Poor/Severe) or unknown/missing.
- Never claim 100% elimination of indoor pollution.
- Use Indian Rupee (₹) tiers: "₹0 Budget", "Under ₹500", "Under ₹2,000", "Under ₹5,000", "Higher-Budget".
- Include "disclaimer" acknowledging indoor limits and any dataGaps.`,
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        summary: { type: Type.STRING },
        ventilationVerdict: { type: Type.STRING },
        rooms: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              room: { type: Type.STRING },
              priorityAction: { type: Type.STRING },
              details: { type: Type.STRING },
            },
            required: ['room', 'priorityAction', 'details'],
          },
        },
        checklists: {
          type: Type.OBJECT,
          properties: {
            daily: { type: Type.ARRAY, items: { type: Type.STRING } },
            weekly: { type: Type.ARRAY, items: { type: Type.STRING } },
            monthly: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['daily', 'weekly', 'monthly'],
        },
        budgetRecommendations: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              tier: { type: Type.STRING },
              items: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['tier', 'items'],
          },
        },
        structuredItems: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              category: { type: Type.STRING },
              priority: { type: Type.STRING },
              action: { type: Type.STRING },
              explanation: { type: Type.STRING },
              estimatedEffort: { type: Type.STRING },
              estimatedCost: { type: Type.STRING },
              impactDescription: { type: Type.STRING },
              confidenceOrLimitation: { type: Type.STRING },
              suggestedTime: { type: Type.STRING },
              sourceType: { type: Type.STRING },
            },
            required: [
              'title',
              'category',
              'priority',
              'action',
              'explanation',
              'estimatedEffort',
              'estimatedCost',
              'impactDescription',
              'confidenceOrLimitation',
              'suggestedTime',
              'sourceType',
            ],
          },
        },
        disclaimer: { type: Type.STRING },
      },
      required: [
        'summary',
        'ventilationVerdict',
        'rooms',
        'checklists',
        'budgetRecommendations',
        'structuredItems',
        'disclaimer',
      ],
    },
    normalizeAndValidate: (parsed) => {
      const summary = sanitizeShortString(parsed.summary, 600);
      const rooms = Array.isArray(parsed.rooms)
        ? parsed.rooms
            .slice(0, 8)
            .filter(isPlainRecord)
            .map((r) => ({
              room: sanitizeShortString(r.room, 60) || 'Bedroom',
              priorityAction: sanitizeShortString(r.priorityAction, 200),
              details: sanitizeShortString(r.details, 360),
            }))
            .filter((r) => r.priorityAction.length > 0 && r.details.length > 0)
        : [];
      const rawChecklists = isPlainRecord(parsed.checklists) ? parsed.checklists : {};
      const checklists = {
        daily: sanitizeStringArray(rawChecklists.daily, 8, 220),
        weekly: sanitizeStringArray(rawChecklists.weekly, 8, 220),
        monthly: sanitizeStringArray(rawChecklists.monthly, 8, 220),
      };
      if (!summary || rooms.length === 0 || checklists.daily.length === 0) {
        throw new GeminiServiceError(
          'AI_INVALID_RESPONSE',
          'Indoor care plan response was incomplete.',
          502
        );
      }
      return {
        summary,
        ventilationVerdict: sanitizeShortString(parsed.ventilationVerdict, 400),
        rooms,
        checklists,
        budgetRecommendations: Array.isArray(parsed.budgetRecommendations)
          ? parsed.budgetRecommendations
              .slice(0, 6)
              .filter(isPlainRecord)
              .map((b) => ({
                tier: sanitizeShortString(b.tier, 60) || '₹0 Budget',
                items: sanitizeStringArray(b.items, 6, 220),
              }))
          : [],
        structuredItems: Array.isArray(parsed.structuredItems)
          ? parsed.structuredItems
              .slice(0, 6)
              .filter(isPlainRecord)
              .map((s) => ({
                title: sanitizeShortString(s.title, 120),
                category: sanitizeShortString(s.category, 60),
                priority: normalizePlanPriority(s.priority),
                action: sanitizeShortString(s.action, 300),
                explanation: sanitizeShortString(s.explanation, 320),
                estimatedEffort: sanitizeShortString(s.estimatedEffort, 80),
                estimatedCost: sanitizeShortString(s.estimatedCost, 60),
                impactDescription: sanitizeShortString(s.impactDescription, 240),
                confidenceOrLimitation: sanitizeShortString(s.confidenceOrLimitation, 260),
                suggestedTime: sanitizeShortString(s.suggestedTime, 60),
                sourceType: 'ai_generated',
              }))
          : [],
        disclaimer: sanitizeShortString(parsed.disclaimer, 420),
      };
    },
  },

  'outdoor-activity': {
    malformedErrorMessage: 'Outdoor activity recommendation was malformed.',
    buildPrompt: (contextStr, payloadStr) => `Verified Context: ${contextStr}
Outdoor Activity & Deterministic Risk Payload: ${payloadStr}

Workflow 4 — Outdoor Activity Decision:
Evaluate whether the user should proceed, shorten, shift time, or move indoors for this specific activity and exertion level given the current AQI, primary pollutant (e.g. ozone afternoon peaks vs morning PM2.5 inversions), 24h hourly window summary, weather/wind, household sensitivities, and recent exposure history.
- "riskAssessment" must be one of ["Low","Moderate","Elevated","High"], matching or thoughtfully explaining the deterministic exposure tier provided.
- Always specify a concrete "bestTimeWindow", practical "breathingPrecautions" (2–4 items), and a concrete "indoorAlternativePlan".
- Explicitly note any missing readings or Demo Mode context in "dataLimitationNote".`,
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        verdict: { type: Type.STRING },
        riskAssessment: { type: Type.STRING },
        bestTimeWindow: { type: Type.STRING },
        breathingPrecautions: { type: Type.ARRAY, items: { type: Type.STRING } },
        indoorAlternativePlan: { type: Type.STRING },
        whyBasedOnReadings: { type: Type.STRING },
        dataLimitationNote: { type: Type.STRING },
      },
      required: [
        'verdict',
        'riskAssessment',
        'bestTimeWindow',
        'breathingPrecautions',
        'indoorAlternativePlan',
        'whyBasedOnReadings',
        'dataLimitationNote',
      ],
    },
    normalizeAndValidate: (parsed) => {
      const verdict = sanitizeShortString(parsed.verdict, 350);
      const bestTimeWindow = sanitizeShortString(parsed.bestTimeWindow, 240);
      const indoorAlternativePlan = sanitizeShortString(parsed.indoorAlternativePlan, 350);
      const rawRisk = sanitizeShortString(parsed.riskAssessment, 30).toLowerCase();
      const riskAssessment =
        rawRisk.includes('high') || rawRisk.includes('severe')
          ? 'High'
          : rawRisk.includes('elevated')
          ? 'Elevated'
          : rawRisk.includes('moderate')
          ? 'Moderate'
          : rawRisk.includes('low')
          ? 'Low'
          : null;

      if (!verdict || !bestTimeWindow || !indoorAlternativePlan || !riskAssessment) {
        throw new GeminiServiceError(
          'AI_INVALID_RESPONSE',
          'Outdoor activity recommendation was incomplete.',
          502
        );
      }

      return {
        verdict,
        riskAssessment,
        bestTimeWindow,
        breathingPrecautions: sanitizeStringArray(parsed.breathingPrecautions, 5, 220),
        indoorAlternativePlan,
        whyBasedOnReadings: sanitizeShortString(parsed.whyBasedOnReadings, 450),
        dataLimitationNote: sanitizeShortString(parsed.dataLimitationNote, 380),
        isAiGenerated: true,
      };
    },
  },

  'explain-air': {
    malformedErrorMessage: 'Explain My Air response was malformed.',
    buildPrompt: (contextStr, payloadStr) => `Verified Context: ${contextStr}
Question & Reading Mode Payload: ${payloadStr}

Workflow 5 — Pollution Explanation:
Answer the user's question in the requested tone ("beginner", "detailed", or "family"), referencing actual measurements, primary pollutant, weather dispersion (wind/humidity), and timestamp/freshness from Verified Context. Include an explicit "uncertaintyDisclosure" noting any dataGaps plus regional vs street-level caveats.`,
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        summary: { type: Type.STRING },
        reasoning: { type: Type.STRING },
        practicalActions: { type: Type.ARRAY, items: { type: Type.STRING } },
        uncertaintyDisclosure: { type: Type.STRING },
        followUpQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: [
        'summary',
        'reasoning',
        'practicalActions',
        'uncertaintyDisclosure',
        'followUpQuestions',
      ],
    },
    normalizeAndValidate: (parsed) => {
      const summary = sanitizeShortString(parsed.summary, 600);
      const reasoning = sanitizeShortString(parsed.reasoning, 900);
      const practicalActions = sanitizeStringArray(parsed.practicalActions, 6, 260);
      if (!summary || !reasoning || practicalActions.length === 0) {
        throw new GeminiServiceError(
          'AI_INVALID_RESPONSE',
          'Explain My Air response was incomplete.',
          502
        );
      }
      return {
        summary,
        reasoning,
        practicalActions,
        uncertaintyDisclosure: sanitizeShortString(parsed.uncertaintyDisclosure, 420),
        followUpQuestions: sanitizeStringArray(parsed.followUpQuestions, 4, 140),
      };
    },
  },

  'sustainability-plan': {
    malformedErrorMessage: 'Sustainability plan response was malformed.',
    buildPrompt: (contextStr, payloadStr) => `Verified Context: ${contextStr}
Sustainability Goals & Score Payload: ${payloadStr}

Workflow 6 — Sustainability Planning:
Analyze the user's active goals, completion progress, lifestyle role, commute mode, home cooking method, and current city pollution drivers to propose realistic, high-leverage weekly clean-air habit adjustments.
- Reference the deterministic score/completed counts provided without inventing new CO2 numbers.
- Do NOT suggest high-exertion outdoor walking/cycling in Poor/Severe AQI; instead pair clean-air travel with exposure safety.
- Include explicit "dataLimitationNote" acknowledging approximate emission estimates and any dataGaps.`,
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        weeklyFocus: { type: Type.STRING },
        impactSummary: { type: Type.STRING },
        priorityActions: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              whyItMatters: { type: Type.STRING },
              practicalStep: { type: Type.STRING },
              cadence: { type: Type.STRING },
            },
            required: ['title', 'whyItMatters', 'practicalStep', 'cadence'],
          },
        },
        habitSynergies: { type: Type.ARRAY, items: { type: Type.STRING } },
        dataLimitationNote: { type: Type.STRING },
      },
      required: [
        'weeklyFocus',
        'impactSummary',
        'priorityActions',
        'habitSynergies',
        'dataLimitationNote',
      ],
    },
    normalizeAndValidate: (parsed) => {
      const weeklyFocus = sanitizeShortString(parsed.weeklyFocus, 350);
      const priorityActions = Array.isArray(parsed.priorityActions)
        ? parsed.priorityActions
            .slice(0, 5)
            .filter(isPlainRecord)
            .map((a) => ({
              title: sanitizeShortString(a.title, 120),
              whyItMatters: sanitizeShortString(a.whyItMatters, 260),
              practicalStep: sanitizeShortString(a.practicalStep, 280),
              cadence: sanitizeShortString(a.cadence, 60) || 'Weekly',
            }))
            .filter((a) => a.title.length > 0 && a.practicalStep.length > 0)
        : [];
      if (!weeklyFocus || priorityActions.length === 0) {
        throw new GeminiServiceError(
          'AI_INVALID_RESPONSE',
          'Sustainability plan response was incomplete.',
          502
        );
      }
      return {
        weeklyFocus,
        impactSummary: sanitizeShortString(parsed.impactSummary, 500),
        priorityActions,
        habitSynergies: sanitizeStringArray(parsed.habitSynergies, 4, 240),
        dataLimitationNote: sanitizeShortString(parsed.dataLimitationNote, 380),
        isAiGenerated: true,
      };
    },
  },

  'commute-advice': {
    malformedErrorMessage: 'Commute strategy response was malformed.',
    buildPrompt: (contextStr, payloadStr) => `Verified Context: ${contextStr}
Trip & Deterministic Estimates Payload: ${payloadStr}

Workflow 7 — Lower-Exposure Commuting:
Personalize a lower-exposure commuting strategy for the user's exact origin, destination, distance (km), travel window, mode, quiet-street preference, household needs, current AQI/NO2/PM2.5/wind, and 24h trajectory.
- Use ONLY the deterministic time and CO2e ranges passed in payload; never invent live traffic delays or street names not provided.
- Explicitly note in "dataLimitationNote" that live street-by-street traffic routing is not connected plus any environmental dataGaps.`,
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        recommendedOption: { type: Type.STRING },
        timingAdjustment: { type: Type.STRING },
        exposureReductionSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
        gearChecklist: { type: Type.ARRAY, items: { type: Type.STRING } },
        tradeOffSummary: { type: Type.STRING },
        dataLimitationNote: { type: Type.STRING },
      },
      required: [
        'recommendedOption',
        'timingAdjustment',
        'exposureReductionSteps',
        'gearChecklist',
        'tradeOffSummary',
        'dataLimitationNote',
      ],
    },
    normalizeAndValidate: (parsed) => {
      const recommendedOption = sanitizeShortString(parsed.recommendedOption, 400);
      const timingAdjustment = sanitizeShortString(parsed.timingAdjustment, 320);
      const exposureReductionSteps = sanitizeStringArray(parsed.exposureReductionSteps, 5, 240);
      if (!recommendedOption || !timingAdjustment || exposureReductionSteps.length === 0) {
        throw new GeminiServiceError(
          'AI_INVALID_RESPONSE',
          'Commute strategy response was incomplete.',
          502
        );
      }
      return {
        recommendedOption,
        timingAdjustment,
        exposureReductionSteps,
        gearChecklist: sanitizeStringArray(parsed.gearChecklist, 5, 160),
        tradeOffSummary: sanitizeShortString(parsed.tradeOffSummary, 400),
        dataLimitationNote: sanitizeShortString(parsed.dataLimitationNote, 380),
        isAiGenerated: true,
      };
    },
  },

  'budget-home-upgrade': {
    malformedErrorMessage: 'Budget home upgrade response was malformed.',
    buildPrompt: (contextStr, payloadStr) => `Verified Context: ${contextStr}
Home & Budget Upgrade Payload: ${payloadStr}

Workflow 8 — Budget-Based Home Improvement:
Recommend prioritized clean-air upgrades strictly matched to the user's selected ₹ budget tier, home sq ft, room count, cooking fuel, ventilation setup, existing filter type, dust/humidity, pets/smoke exposure, and outdoor AQI.
- Prioritize highest air-quality return per Rupee for this exact home (e.g., sealing gaps & cooking exhaust before buying oversized devices when budget is ₹0–₹2,000; bedroom HEPA sizing for ₹5,000+).
- Clearly list "skipForNow" (things not worth spending their budget on for this profile).
- Include explicit "limitation" per item and overall "dataLimitationNote".`,
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        budgetLabel: { type: Type.STRING },
        strategySummary: { type: Type.STRING },
        prioritizedUpgrades: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              item: { type: Type.STRING },
              approxCostRange: { type: Type.STRING },
              reasonForThisHome: { type: Type.STRING },
              expectedBenefit: { type: Type.STRING },
              limitation: { type: Type.STRING },
            },
            required: [
              'item',
              'approxCostRange',
              'reasonForThisHome',
              'expectedBenefit',
              'limitation',
            ],
          },
        },
        skipForNow: { type: Type.ARRAY, items: { type: Type.STRING } },
        dataLimitationNote: { type: Type.STRING },
      },
      required: [
        'budgetLabel',
        'strategySummary',
        'prioritizedUpgrades',
        'skipForNow',
        'dataLimitationNote',
      ],
    },
    normalizeAndValidate: (parsed) => {
      const strategySummary = sanitizeShortString(parsed.strategySummary, 500);
      const prioritizedUpgrades = Array.isArray(parsed.prioritizedUpgrades)
        ? parsed.prioritizedUpgrades
            .slice(0, 5)
            .filter(isPlainRecord)
            .map((u) => ({
              item: sanitizeShortString(u.item, 140),
              approxCostRange: sanitizeShortString(u.approxCostRange, 80) || 'Varies',
              reasonForThisHome: sanitizeShortString(u.reasonForThisHome, 280),
              expectedBenefit: sanitizeShortString(u.expectedBenefit, 240),
              limitation: sanitizeShortString(u.limitation, 260),
            }))
            .filter((u) => u.item.length > 0 && u.reasonForThisHome.length > 0)
        : [];
      if (!strategySummary || prioritizedUpgrades.length === 0) {
        throw new GeminiServiceError(
          'AI_INVALID_RESPONSE',
          'Budget upgrade response was incomplete.',
          502
        );
      }
      return {
        budgetLabel: sanitizeShortString(parsed.budgetLabel, 80) || 'Budget Plan',
        strategySummary,
        prioritizedUpgrades,
        skipForNow: sanitizeStringArray(parsed.skipForNow, 4, 220),
        dataLimitationNote: sanitizeShortString(parsed.dataLimitationNote, 380),
        isAiGenerated: true,
      };
    },
  },
};
