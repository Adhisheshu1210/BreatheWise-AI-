import { useState } from 'react';
import { Loader2, MessageSquare, RefreshCw, Send, Trash2 } from 'lucide-react';
import { ExplainAirPanel } from '../components/ExplainAirPanel.tsx';
import { FormattedAiText } from '../components/FormattedAiText.tsx';
import {
  buildAiContextPayload,
  buildDemoChatReply,
  sendChatMessageApi,
} from '../services/apiClient.ts';
import type {
  AirQualitySnapshot,
  ChatMessage,
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
                        onClick={() => void sendMessage(prompt)}
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
                          <FormattedAiText text={msg.content} />
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
                    onClick={() => void sendMessage(lastFailedPrompt)}
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
          <ExplainAirPanel
            snapshot={snapshot}
            prefs={prefs}
            homeProfile={homeProfile}
            sustainabilityGoals={sustainabilityGoals}
            exposureLogs={exposureLogs}
            geminiConfigured={geminiConfigured}
          />
        )}
      </div>
    </div>
  );
}
