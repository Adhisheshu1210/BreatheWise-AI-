import type { AqiCategoryId } from '../types/airQuality.ts';

export interface ActivityDefinition {
  id: string;
  name: string;
  intensity: 'low' | 'moderate' | 'vigorous';
  indoorAlternativeTitle: string;
  indoorAlternativeDetails: string;
}

export const OUTDOOR_ACTIVITIES: ActivityDefinition[] = [
  {
    id: 'walking',
    name: 'Walking',
    intensity: 'low',
    indoorAlternativeTitle: 'Indoor Hallway / Mall Walk or Gentle Mobility',
    indoorAlternativeDetails:
      '15–25 minutes of brisk indoor pacing, stair stepping, or joint mobility stretches in a filtered room.',
  },
  {
    id: 'running',
    name: 'Running',
    intensity: 'vigorous',
    indoorAlternativeTitle: 'Indoor Cardio Circuit or Treadmill Session',
    indoorAlternativeDetails:
      'Alternate 45-second jumping jacks, shadow boxing, or stair intervals with 30-second rest for 20 minutes indoors.',
  },
  {
    id: 'cycling',
    name: 'Cycling',
    intensity: 'vigorous',
    indoorAlternativeTitle: 'Stationary Cycling or Core Conditioning',
    indoorAlternativeDetails:
      'Use an indoor stationary bike if available, or complete a 25-minute lower-body strength and core routine.',
  },
  {
    id: 'yoga',
    name: 'Outdoor Yoga',
    intensity: 'low',
    indoorAlternativeTitle: 'Home Yoga & Nasal Breathing Flow',
    indoorAlternativeDetails:
      'Roll out a mat indoors away from drafty windows; focus on gentle stretching and calm nasal breathing.',
  },
  {
    id: 'kids_play',
    name: "Children's Outdoor Play",
    intensity: 'moderate',
    indoorAlternativeTitle: 'Indoor Creative & Movement Play',
    indoorAlternativeDetails:
      'Set up indoor obstacle courses, building blocks, dance-along games, or art projects in a clean room.',
  },
  {
    id: 'school_commute',
    name: 'School Commute',
    intensity: 'low',
    indoorAlternativeTitle: 'Enclosed Transit + Side-Street Timing',
    indoorAlternativeDetails:
      'Use enclosed carpool or public transit when AQI exceeds 150, and equip older children with well-fitted masks.',
  },
  {
    id: 'grocery',
    name: 'Grocery Shopping',
    intensity: 'low',
    indoorAlternativeTitle: 'Consolidated List / Delivery Option',
    indoorAlternativeDetails:
      'Combine errands into one midday trip when dispersion is higher, or use delivery on severe smog days.',
  },
  {
    id: 'dog_walking',
    name: 'Dog Walking',
    intensity: 'low',
    indoorAlternativeTitle: 'Short Relief Breaks + Indoor Enrichment',
    indoorAlternativeDetails:
      'Keep walks to 10-minute bathroom breaks on quiet streets; use indoor scent puzzles and tug games for energy.',
  },
  {
    id: 'sports',
    name: 'Outdoor Sports',
    intensity: 'vigorous',
    indoorAlternativeTitle: 'Indoor Court / Bodyweight Skill Drills',
    indoorAlternativeDetails:
      'Move practice to an enclosed ventilated gym or focus on indoor agility, balance, and reaction drills.',
  },
];

export function evaluateActivityGuidance(
  activity: ActivityDefinition,
  categoryId: AqiCategoryId,
  usAqi: number | null
): {
  riskLevel: 'Low' | 'Moderate' | 'Elevated' | 'High';
  recommendedTiming: string;
  durationGuidance: string;
  precautions: string[];
  explanation: string;
} {
  const aqiText = usAqi !== null ? `US AQI ${usAqi}` : 'current conditions';

  if (categoryId === 'good') {
    return {
      riskLevel: 'Low',
      recommendedTiming: 'Anytime; morning or late afternoon are pleasant.',
      durationGuidance: 'Normal duration (30–60+ min) without air-quality restrictions.',
      precautions: [
        'Choose park paths or quieter residential streets over congested main roads.',
        'Stay hydrated and watch for sudden localized dust or smoke.',
      ],
      explanation: `At ${aqiText}, ambient air quality is within the Good range, supporting normal outdoor ${activity.name.toLowerCase()}.`,
    };
  }

  if (categoryId === 'moderate') {
    const isVigorous = activity.intensity === 'vigorous';
    return {
      riskLevel: isVigorous ? 'Moderate' : 'Low',
      recommendedTiming: 'Late morning to mid-afternoon if ozone is low; avoid rush-hour intersections.',
      durationGuidance: isVigorous
        ? '25–40 minutes at steady moderate pace.'
        : 'Normal duration for most people; sensitive groups should pace exertion.',
      precautions: [
        'People with asthma or respiratory sensitivity should monitor symptoms and carry rescue medication if prescribed.',
        'Avoid routes directly beside idling buses or heavy highway traffic.',
      ],
      explanation: `At ${aqiText} (Moderate), overall risk is mild, though ${
        isVigorous ? 'vigorous breathing increases particle intake' : 'sensitive individuals may feel subtle irritation'
      }.`,
    };
  }

  if (categoryId === 'sensitive') {
    const isVigorous = activity.intensity === 'vigorous';
    return {
      riskLevel: isVigorous ? 'Elevated' : 'Moderate',
      recommendedTiming: 'Prefer midday (12:00 PM–3:00 PM) when morning inversion typically eases.',
      durationGuidance: isVigorous
        ? 'Shorten to 15–20 min or switch to the indoor alternative.'
        : 'Keep essential trips under 30 min; limit prolonged play for children.',
      precautions: [
        'Children, seniors, and sensitive individuals should favor indoor options.',
        'Take frequent breaks and avoid deep mouth-breathing near traffic.',
      ],
      explanation: `At ${aqiText}, sensitive groups face noticeable respiratory stress, especially during ${activity.intensity}-intensity outdoor exertion.`,
    };
  }

  if (categoryId === 'poor') {
    return {
      riskLevel: activity.intensity === 'low' ? 'Elevated' : 'High',
      recommendedTiming: 'Limit outdoor stays strictly to necessary errands during midday.',
      durationGuidance:
        activity.intensity === 'vigorous'
          ? 'Avoid outdoor strenuous exercise; use the indoor alternative.'
          : 'Keep necessary outdoor time brief (10–20 min).',
      precautions: [
        'Wear a well-fitted N95/FFP2 respirator for necessary outdoor commutes or errands.',
        'Shift exercise and children’s play indoors.',
      ],
      explanation: `At ${aqiText} (Poor), elevated particulate levels affect healthy adults as well as sensitive groups, making indoor alternatives safer.`,
    };
  }

  return {
    riskLevel: 'High',
    recommendedTiming: 'Postpone non-essential outdoor activity until conditions improve.',
    durationGuidance: 'Move all recreational activity indoors; keep essential outdoor trips minimal.',
    precautions: [
      'Use a well-fitted N95/FFP2 mask if stepping outdoors is unavoidable.',
      'Follow official local municipal health advisories.',
      'Keep windows shut and protect vulnerable household members indoors.',
    ],
    explanation: `At ${aqiText} (${categoryId === 'severe' ? 'Severe' : 'Very Poor'}), air pollution poses significant irritation risks even during light outdoor activity.`,
  };
}

export interface EducationTopic {
  id: string;
  title: string;
  summary: string;
  keyTakeaway: string;
  details: string[];
}

export const EDUCATION_TOPICS: EducationTopic[] = [
  {
    id: 'what-is-aqi',
    title: 'What Is AQI?',
    summary: 'How the Air Quality Index turns complex pollutant measurements into a 0–500 health scale.',
    keyTakeaway: 'Higher numbers mean higher health concern—usually driven by whichever pollutant is worst at that hour.',
    details: [
      'The US EPA AQI converts concentrations of major pollutants (PM2.5, PM10, O₃, NO₂, SO₂, CO) onto a unified scale where 0–50 is Good and above 150 is Unhealthy/Poor.',
      'Different countries use slightly different scales (for example, European EAQI uses 0–100+ bands and India NAQI uses 0–500 with different breakpoints). Never compare raw numbers across different AQI standards without noting the scale.',
    ],
  },
  {
    id: 'pm25-vs-pm10',
    title: 'PM2.5 vs PM10',
    summary: 'Why particle size determines how deeply pollution travels into your respiratory system.',
    keyTakeaway: 'PM2.5 is ~30x narrower than a human hair and penetrates deepest into lungs.',
    details: [
      'PM10 includes coarse dust, pollen, and road debris up to 10 micrometers wide—mostly irritating the nose, throat, and upper airways.',
      'PM2.5 refers to fine particles 2.5 micrometers or smaller from combustion, vehicle exhaust, biomass burning, and secondary winter haze. These bypass upper airway filters and reach deep lung alveoli.',
    ],
  },
  {
    id: 'winter-smog',
    title: 'Why Winter Smog Occurs',
    summary: 'Why air quality often worsens dramatically from late autumn through winter.',
    keyTakeaway: 'Cold stagnant air + seasonal heating/burning + trapped vehicle exhaust create dense winter haze.',
    details: [
      'During winter, colder temperatures increase residential heating, idling, and biomass burning while slowing chemical dispersion.',
      'High humidity can also cause fine particles to swell and scatter light, reducing visibility and keeping smog close to the ground.',
    ],
  },
  {
    id: 'temperature-inversions',
    title: 'Temperature Inversions',
    summary: 'How a warm atmospheric "lid" traps urban pollution near street level overnight and at dawn.',
    keyTakeaway: 'Midday sunlight often breaks inversions, which is why afternoon air is sometimes cleaner than 7:00 AM.',
    details: [
      'Normally, air gets cooler with altitude so warm polluted air rises and disperses.',
      'On calm, clear nights, the ground cools rapidly, leaving a layer of cold air trapped beneath warmer air above—acting like a lid over the city until midday warmth mixes the air column.',
    ],
  },
  {
    id: 'vehicle-emissions',
    title: 'Vehicle Emissions & Roadside Exposure',
    summary: 'Why stepping just one or two blocks away from a main highway lowers exposure.',
    keyTakeaway: 'Tailpipe NO₂ and ultrafine soot drop sharply within 50–150 meters of busy arterial roads.',
    details: [
      'Stop-and-go traffic and idling engines emit concentrated nitrogen dioxide (NO₂), carbon monoxide, and brake/tire wear particles.',
      'Choosing parallel residential streets for walking or cycling reduces proximity to concentrated exhaust plumes.',
    ],
  },
  {
    id: 'indoor-pollution',
    title: 'Indoor Air Pollution Sources',
    summary: 'Why sealing windows is only half the picture—indoor activities generate particles too.',
    keyTakeaway: 'Cooking fumes, incense, candles, tobacco smoke, and dry sweeping can spike indoor PM2.5.',
    details: [
      'High-temperature frying on gas or oil stoves can temporarily push indoor PM2.5 higher than outdoor air.',
      'Always use kitchen exhaust ventilation, wipe surfaces with damp cloths, and avoid indoor combustion sources like incense or candles on smoggy days.',
    ],
  },
  {
    id: 'cleaner-cooking',
    title: 'Cleaner Cooking Practices',
    summary: 'Practical kitchen habits that reduce indoor particle and NO₂ buildup.',
    keyTakeaway: 'Range hoods, rear burners, pot lids, and electric induction meaningfully cut indoor fumes.',
    details: [
      'Turn on the exhaust fan before lighting the stove and keep it running 10 minutes after finishing.',
      'Where available, electric induction cooking avoids direct combustion gases like NO₂ indoors.',
    ],
  },
  {
    id: 'air-purifiers',
    title: 'Air Purifiers & HEPA Filters',
    summary: 'How portable air cleaners work and what specifications actually matter.',
    keyTakeaway: 'Look for True HEPA filtration and match CADR (Clean Air Delivery Rate) to your room size.',
    details: [
      'True HEPA filters capture fine airborne particulates when air circulates through them; activated carbon helps reduce odors and some gases.',
      'Avoid "ionizer" or ozone-generating modes, as ozone itself is an airway irritant.',
    ],
  },
  {
    id: 'masks-limitations',
    title: 'Masks & Their Limitations',
    summary: 'Why cloth and loose surgical masks do little against fine PM2.5 smog—and what works better.',
    keyTakeaway: 'A snug N95, KN95, or FFP2 respirator filters fine particles; gaps around the nose ruin effectiveness.',
    details: [
      'Cloth masks and loose blue surgical masks allow fine PM2.5 particles to leak around the edges.',
      'Well-fitted N95/FFP2 respirators filter fine particulate matter effectively, though they do not block gaseous pollutants like NO₂ or CO. Children and people with breathing difficulties should seek guidance on safe mask fit.',
    ],
  },
  {
    id: 'pollution-exercise',
    title: 'Pollution & Exercise',
    summary: 'Why intense outdoor workouts amplify pollution intake.',
    keyTakeaway: 'During vigorous running or cycling, your breathing rate can increase 5–10x compared to rest.',
    details: [
      'Heavy exertion shifts breathing from the nose (which filters larger dust) to the mouth, drawing particles deeper into the lungs.',
      'Moving intense cardio indoors when AQI exceeds 100–150 preserves fitness gains without high particle inhalation.',
    ],
  },
  {
    id: 'vulnerable-groups',
    title: 'Protecting Vulnerable Groups',
    summary: 'Why children, older adults, and people with respiratory conditions need extra caution.',
    keyTakeaway: 'Early planning, clean bedrooms, and following personal clinician guidance keep risks lower.',
    details: [
      'Children have developing lungs and breathe more air per kilogram of body weight than adults.',
      'Older adults and people with asthma or heart conditions should keep prescribed medications handy and consult healthcare professionals for personalized action plans.',
    ],
  },
  {
    id: 'sustainable-living',
    title: 'Sustainable Urban Living',
    summary: 'How everyday transport and energy choices connect to cleaner city air.',
    keyTakeaway: 'Shorter car trips replaced by walking, transit, and no-idling reduce local tailpipe emissions.',
    details: [
      'Cold engine starts and short car errands produce disproportionately high emissions per kilometer.',
      'Combining errands, turning off idling engines, and supporting neighborhood walking/transit groups benefit both personal health and urban air.',
    ],
  },
];

export const GLOSSARY_ITEMS = [
  { term: 'AQI (Air Quality Index)', definition: 'A standardized numerical scale summarizing overall air pollution health risk.' },
  { term: 'µg/m³', definition: 'Micrograms per cubic meter — the standard unit measuring mass of a pollutant in one cubic meter of air.' },
  { term: 'WHO Guideline', definition: 'World Health Organization 2021 health-based reference benchmarks for safe pollutant exposure.' },
  { term: 'CADR', definition: 'Clean Air Delivery Rate — how quickly an air purifier delivers filtered air to a room.' },
  { term: 'HEPA H13', definition: 'High-Efficiency Particulate Air filter rated to capture at least 99.95% of 0.3-micron particles.' },
  { term: 'Temperature Inversion', definition: 'Weather condition where a layer of warm air traps cooler, polluted air near the ground.' },
];

export const EDUCATION_FAQS = [
  {
    q: 'If the sky looks clear, does that mean air quality is good?',
    a: 'Not always. Gases like ozone (O₃) and nitrogen dioxide (NO₂) are invisible at typical urban concentrations, and fine PM2.5 can still be elevated in bright sunlight.',
  },
  {
    q: 'Do houseplants clean smog out of a room?',
    a: 'While houseplants add greenery and comfort, controlled studies show you would need dozens of plants per square meter to match even a small mechanical HEPA purifier.',
  },
  {
    q: 'Should I open windows at night to cool down my home during winter smog?',
    a: 'Usually no during winter smog episodes. Overnight temperatures often create inversions that cause outdoor PM2.5 to peak late at night and early morning. Check your local hourly AQI trend first.',
  },
];
