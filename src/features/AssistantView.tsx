import { useState } from 'react';
import {
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { AiErrorBanner } from '../components/UiFeedback.tsx';
import {
  buildAiContextPayload,
  buildDemoChatReply,
  buildDemoExplainAir,
  requestStructuredAiApi,
  sendChatMessageApi,
} from '../services/apiClient.ts';
import type {
  AirQualitySnapshot,
  ChatMessage,
  ExplainAirResult,
  ExposureLogEntry,
  IndoorHomeProfile,
  SustainabilityGoal,
  UserPreferences,
} from '../types/airQuality.ts';
import { getActiveAqiValue } from '../utils/aqi.ts';

interface AssistantViewProps {
  snapshot: AirQualitySnapshot | null;
  prefs: UserPreferences;
  homeProfile: IndoorHomeProfile;
  sustainabilityGoals?: SustainabilityGoal[];
  exposureLogs?: ExposureLogEntry[];
  geminiConfigured: boolean;
  messages: ChatMessage[];
  onUpdateMessages: (next: ChatMessage[]) => void;
}

const STARTER_PROMPTS = [
  "How should I plan my day with today's AQI?",
  "Protect my family from today's pollution.",
  'Improve the air quality inside my home.',
  'Suggest a pollution-friendly commute.',
  'Create a low-emission weekly routine.',
  "Explain today's air quality in simple words.",
];

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

function FormattedText({ text }: { text: string }) {
  // Safe React-only line/bold/italic/heading renderer without raw HTML injection
  const lines = text.split('\n');
  const renderInline = (content: string) =>
    content.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/g).map((part, pIdx) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return (
          <strong key={pIdx} className="font-semibold text-slate-900">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        return (
          <em key={pIdx} className="italic text-slate-700">
            {part.slice(1, -1)}
          </em>
        );
      }
      return <span key={pIdx}>{part}</span>;
    });

  return (
    <div className="space-y-1.5 text-xs leading-relaxed">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={idx} className="h-1" />;

        if (trimmed.startsWith('### ') || trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
          const headingText = trimmed.replace(/^#{1,3}\s+/, '');
          return (
            <h4 key={idx} className="font-semibold text-slate-900 pt-1">
              {renderInline(headingText)}
            </h4>
          );
        }

        if (/^[-*]\s+/.test(trimmed)) {
          const body = trimmed.replace(/^[-*]\s+/, '');
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="text-teal-700 mt-0.5">•</span>
              <span>{renderInline(body)}</span>
            </div>
          );
        }
        return <p key={idx}>{renderInline(trimmed)}</p>;
      })}
    </div>
  );
}

export function AssistantView({
  snapshot,
  prefs,
  homeProfile,
  sustainabilityGoals,
  exposureLogs,
  geminiConfigured,
  messages,
  onUpdateMessages,
}: AssistantViewProps) {
  const [modeTab, setModeTab] = useState<'chat' | 'explain'>('chat');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);

  // Explain My Air state
  const [explainMode, setExplainMode] = useState<'beginner' | 'detailed' | 'family'>('beginner');
  const [explainQuestion, setExplainQuestion] = useState(EXPLAIN_QUESTIONS[0]);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [explainResult, setExplainResult] = useState<ExplainAirResult | null>(null);

  const activeAqi = snapshot ? getActiveAqiValue(snapshot, prefs.aqiStandard) : null;

  const sendMessage = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed || sending) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestampIso: new Date().toISOString(),
    };
    const nextMessages = [...messages, userMsg];
    onUpdateMessages(nextMessages);
    setInput('');
    setLastFailedPrompt(null);

    if (prefs.demoMode || !geminiConfigured) {
      if (snapshot) {
        const demoReply = buildDemoChatReply(trimmed, snapshot, prefs.aqiStandard);
        onUpdateMessages([
          ...nextMessages,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: demoReply,
            timestampIso: new Date().toISOString(),
            isDemoResponse: true,
            contextSnapshotLabel: `${snapshot.location.name} · Demo`,
          },
        ]);
      } else {
        onUpdateMessages([
          ...nextMessages,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content:
              'Please select a city or Demo Mode scenario first so I can tailor guidance to your conditions.',
            timestampIso: new Date().toISOString(),
            isError: true,
          },
        ]);
      }
      return;
    }

    setSending(true);
    try {
      const ctx = buildAiContextPayload({
        snapshot,
        prefs,
        indoorProfile: homeProfile,
        sustainabilityGoals,
        exposureLogs,
      });
      const reply = await sendChatMessageApi({
        message: trimmed,
        history: messages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
        context: ctx,
      });

      onUpdateMessages([
        ...nextMessages,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: reply,
          timestampIso: new Date().toISOString(),
          contextSnapshotLabel: snapshot
            ? `${snapshot.location.name} · ${
                prefs.aqiStandard === 'eaqi' ? 'EAQI' : 'US AQI'
              } ${activeAqi ?? 'N/A'} · ${snapshot.freshnessLabel}`
            : undefined,
        },
      ]);
    } catch (err) {
      setLastFailedPrompt(trimmed);
      onUpdateMessages([
        ...nextMessages,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content:
            err instanceof Error
              ? err.message
              : 'Unable to reach Gemini right now. You can retry or switch to Demo Mode.',
          timestampIso: new Date().toISOString(),
          isError: true,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const runExplainMyAir = async (q: string, forceRefresh = false) => {
    if (!snapshot) return;
    setExplainQuestion(q);
    setExplainError(null);

    if (prefs.demoMode || !geminiConfigured) {
      setExplainResult(buildDemoExplainAir(q, explainMode, snapshot));
      return;
    }

    setExplainLoading(true);
    try {
      const ctx = buildAiContextPayload({
        snapshot,
        prefs,
        indoorProfile: homeProfile,
        sustainabilityGoals,
        exposureLogs,
      });
      const res = await requestStructuredAiApi<
        Omit<ExplainAirResult, 'question' | 'mode' | 'isAiGenerated'>
      >({
        taskType: 'explain-air',
        context: ctx,
        payload: { question: q, readingMode: explainMode },
        forceRefresh,
      });
      setExplainResult({
        ...res,
        question: q,
        mode: explainMode,
        isAiGenerated: true,
      });
    } catch (err) {
      setExplainError(err instanceof Error ? err.message : 'Unable to generate explanation.');
    } finally {
      setExplainLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 sm:px-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">BreatheWise AI Assistant</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Context: {snapshot?.location.name ?? 'No location'} ·{' '}
              {snapshot?.isDemo ? 'Demo dataset' : snapshot?.freshnessLabel ?? 'Live data'} ·{' '}
              {geminiConfigured && !prefs.demoMode
                ? 'Powered by Gemini'
                : 'Demo Simulation Mode'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex p-1 bg-slate-100 rounded-lg" role="group" aria-label="Assistant mode">
              <button
                type="button"
                aria-pressed={modeTab === 'chat'}
                onClick={() => setModeTab('chat')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
                  modeTab === 'chat' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Conversational Chat
              </button>
              <button
                type="button"
                aria-pressed={modeTab === 'explain'}
                onClick={() => setModeTab('explain')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
                  modeTab === 'explain' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Explain My Air
              </button>
            </div>
            {modeTab === 'chat' && messages.length > 0 && (
              <button
                type="button"
                onClick={() => onUpdateMessages([])}
                aria-label="Clear chat history"
                className="p-2 text-slate-500 hover:text-red-600 rounded-lg border border-slate-200"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {modeTab === 'chat' ? (
          <div className="flex flex-col h-[calc(100vh-240px)] min-h-[380px] max-h-[580px]">
            <div
              className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/50"
              role="log"
              aria-live="polite"
              aria-label="Assistant conversation history"
            >
              {messages.length === 0 ? (
                <div className="max-w-xl mx-auto py-8 text-center space-y-4">
                  <MessageSquare className="w-9 h-9 text-teal-700 mx-auto" />
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">
                      Ask anything about today’s air, your home, or your family
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">
                      Responses automatically incorporate your selected city, current AQI, household
                      context, and budget tier without inventing live readings.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
                    {STARTER_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => sendMessage(prompt)}
                        className="p-3 rounded-lg border border-slate-200 bg-white hover:border-teal-500 text-xs font-medium text-slate-800 transition-colors"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] sm:max-w-[75%] rounded-xl px-4 py-3 ${
                        msg.role === 'user'
                          ? 'bg-slate-900 text-white text-xs'
                          : msg.isError
                          ? 'bg-red-50 border border-red-200 text-red-900'
                          : 'bg-white border border-slate-200 text-slate-800'
                      }`}
                    >
                      {msg.role === 'user' ? (
                        <p className="leading-relaxed">{msg.content}</p>
                      ) : (
                        <>
                          <FormattedText text={msg.content} />
                          {msg.contextSnapshotLabel && (
                            <p className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-600">
                              Context: {msg.contextSnapshotLabel}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}

              {sending && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin text-teal-700" />
                  BreatheWise AI is preparing personalized guidance...
                </div>
              )}

              {lastFailedPrompt && !sending && (
                <div className="flex justify-start">
                  <button
                    type="button"
                    onClick={() => sendMessage(lastFailedPrompt)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Retry Last Message
                  </button>
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendMessage(input);
              }}
              className="p-4 border-t border-slate-200 bg-white flex items-center gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about outdoor exercise timing, N95 masks, home air, or commute..."
                aria-label="Message BreatheWise AI Assistant"
                className="flex-1 px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:border-teal-600 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!input.trim() || sending}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                Send
              </button>
            </form>
          </div>
        ) : (
          /* Explain My Air Structured Module */
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
              <div className="inline-flex p-1 bg-slate-100 rounded-lg self-start" role="group" aria-label="Explanation depth">
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
                  onClick={() => runExplainMyAir(q)}
                  disabled={explainLoading}
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

            {explainLoading && (
              <div
                role="status"
                aria-live="polite"
                className="py-8 flex items-center justify-center gap-2 text-xs text-slate-600"
              >
                <Loader2 className="w-4 h-4 animate-spin text-teal-700" aria-hidden="true" />
                Explaining current conditions...
              </div>
            )}

            {explainError && (
              <AiErrorBanner
                error={explainError}
                onRetry={() => runExplainMyAir(explainQuestion, true)}
                secondaryLabel={snapshot ? 'Show Demo Explanation' : undefined}
                onSecondaryAction={
                  snapshot
                    ? () => setExplainResult(buildDemoExplainAir(explainQuestion, explainMode, snapshot))
                    : undefined
                }
              />
            )}

            {explainResult && !explainLoading && (
              <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-teal-700" />
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
                        onClick={() => runExplainMyAir(fq)}
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
        )}
      </div>
    </div>
  );
}
