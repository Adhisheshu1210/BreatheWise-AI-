import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { AiErrorBanner } from './UiFeedback.tsx';
import { useAsyncAction } from '../hooks/useAsyncAction.ts';
import {
  buildAiContextPayload,
  buildDemoExplainAir,
  requestStructuredAiApi,
} from '../services/apiClient.ts';
import type {
  AirQualitySnapshot,
  ExplainAirResult,
  ExposureLogEntry,
  IndoorHomeProfile,
  SustainabilityGoal,
  UserPreferences,
} from '../types/airQuality.ts';

const EXPLAIN_QUESTIONS = [
  'Why is the air quality bad today?',
  'What is PM2.5?',
  'Why does winter smog occur?',
  'Why does air quality change during the day?',
  'Is outdoor exercise advisable today?',
  'How can I improve my indoor air?',
  'How can I protect children?',
  'What can my community do?',
  'Which lifestyle choices matter most?',
];

interface ExplainAirPanelProps {
  snapshot: AirQualitySnapshot | null;
  prefs: UserPreferences;
  homeProfile: IndoorHomeProfile;
  sustainabilityGoals?: SustainabilityGoal[];
  exposureLogs?: ExposureLogEntry[];
  geminiConfigured: boolean;
}

export function ExplainAirPanel({
  snapshot,
  prefs,
  homeProfile,
  sustainabilityGoals,
  exposureLogs,
  geminiConfigured,
}: ExplainAirPanelProps) {
  const [explainMode, setExplainMode] = useState<'beginner' | 'detailed' | 'family'>('beginner');
  const [explainQuestion, setExplainQuestion] = useState(EXPLAIN_QUESTIONS[0]);
  const [explainResult, setExplainResult] = useState<ExplainAirResult | null>(null);
  const explainAction = useAsyncAction('Unable to generate explanation.');

  const runExplainMyAir = async (q: string, forceRefresh = false) => {
    if (!snapshot) return;
    setExplainQuestion(q);
    explainAction.clearError();

    if (prefs.demoMode || !geminiConfigured) {
      setExplainResult(buildDemoExplainAir(q, explainMode, snapshot));
      return;
    }

    const res = await explainAction.run(async () => {
      const ctx = buildAiContextPayload({
        snapshot,
        prefs,
        indoorProfile: homeProfile,
        sustainabilityGoals,
        exposureLogs,
      });
      return requestStructuredAiApi<Omit<ExplainAirResult, 'question' | 'mode' | 'isAiGenerated'>>({
        taskType: 'explain-air',
        context: ctx,
        payload: { question: q, readingMode: explainMode },
        forceRefresh,
      });
    });

    if (res) {
      setExplainResult({
        ...res,
        question: q,
        mode: explainMode,
        isAiGenerated: true,
      });
    }
  };

  return (
    <div className="p-5 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Explain My Air — Plain-Language Environmental Explainer
          </h2>
          <p className="text-xs text-slate-500">
            Choose an explanation depth and tap any common question.
          </p>
        </div>
        <div
          className="inline-flex p-1 bg-slate-100 rounded-lg self-start"
          role="group"
          aria-label="Explanation depth"
        >
          {(
            [
              ['beginner', 'Beginner'],
              ['detailed', 'Detailed'],
              ['family', 'Family-Friendly'],
            ] as const
          ).map(([m, lbl]) => (
            <button
              key={m}
              type="button"
              aria-pressed={explainMode === m}
              onClick={() => setExplainMode(m)}
              className={`px-3 py-1 text-xs font-medium rounded-md ${
                explainMode === m ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {EXPLAIN_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => void runExplainMyAir(q)}
            disabled={explainAction.loading}
            className={`p-3 rounded-lg border text-left text-xs font-medium transition-colors ${
              explainQuestion === q && explainResult
                ? 'border-teal-600 bg-teal-50 text-teal-950'
                : 'border-slate-200 hover:bg-slate-50 text-slate-800'
            }`}
          >
            {q}
          </button>
        ))}
      </div>

      {explainAction.loading && (
        <div
          role="status"
          aria-live="polite"
          className="py-8 flex items-center justify-center gap-2 text-xs text-slate-600"
        >
          <Loader2 className="w-4 h-4 animate-spin text-teal-700" aria-hidden="true" />
          Explaining current conditions...
        </div>
      )}

      {explainAction.error && (
        <AiErrorBanner
          error={explainAction.error}
          onRetry={() => void runExplainMyAir(explainQuestion, true)}
          secondaryLabel={snapshot ? 'Show Demo Explanation' : undefined}
          onSecondaryAction={
            snapshot
              ? () => {
                  explainAction.clearError();
                  setExplainResult(buildDemoExplainAir(explainQuestion, explainMode, snapshot));
                }
              : undefined
          }
        />
      )}

      {explainResult && !explainAction.loading && (
        <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-teal-700" aria-hidden="true" />
              {explainResult.question}
            </h3>
            <span className="text-[11px] text-slate-500 capitalize">
              {explainResult.mode} mode ·{' '}
              {explainResult.isDemoMock ? 'Demo simulation' : 'Gemini explanation'}
            </span>
          </div>

          <p className="text-sm font-medium text-slate-900 leading-relaxed">
            {explainResult.summary}
          </p>
          <p className="text-xs text-slate-700 leading-relaxed">{explainResult.reasoning}</p>

          <div>
            <div className="text-xs font-semibold text-slate-900 mb-1.5">
              Practical Recommendations
            </div>
            <ul className="space-y-1 text-xs text-slate-700 list-disc list-inside">
              {explainResult.practicalActions.map((act, i) => (
                <li key={i}>{act}</li>
              ))}
            </ul>
          </div>

          <p className="text-[11px] text-slate-500 pt-2 border-t border-slate-200">
            <strong>Limitation & Context:</strong> {explainResult.uncertaintyDisclosure}
          </p>

          {explainResult.followUpQuestions.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {explainResult.followUpQuestions.map((fq) => (
                <button
                  key={fq}
                  type="button"
                  onClick={() => void runExplainMyAir(fq)}
                  className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg hover:border-teal-500 text-slate-700"
                >
                  {fq}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
