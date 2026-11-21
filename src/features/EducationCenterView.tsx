import { useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import {
  EDUCATION_FAQS,
  EDUCATION_TOPICS,
  GLOSSARY_ITEMS,
} from '../data/educationContent.ts';

export function EducationCenterView() {
  const [selectedId, setSelectedId] = useState(EDUCATION_TOPICS[0].id);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const selected =
    EDUCATION_TOPICS.find((t) => t.id === selectedId) ?? EDUCATION_TOPICS[0];

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6">
        <div className="pb-4 border-b border-slate-100">
          <h1 className="text-xl font-bold text-slate-900">Air Quality Learning Center</h1>
          <p className="text-xs text-slate-500 mt-1">
            Clear, evidence-aware explanations of urban air science, indoor protection, and masks—no
            jargon required.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
            {EDUCATION_TOPICS.map((topic, idx) => {
              const active = topic.id === selected.id;
              return (
                <button
                  key={topic.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelectedId(topic.id)}
                  className={`p-3.5 min-h-[52px] rounded-lg border text-left transition-colors ${
                    active
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <div className="text-xs font-semibold">
                    {String(idx + 1).padStart(2, '0')}. {topic.title}
                  </div>
                  <div
                    className={`text-[11px] mt-0.5 line-clamp-1 ${
                      active ? 'text-slate-300' : 'text-slate-600'
                    }`}
                  >
                    {topic.summary}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="lg:col-span-7 space-y-5">
            <article className="p-5 sm:p-6 rounded-xl border border-slate-200 bg-slate-50/70 space-y-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-teal-800">
                <BookOpen className="w-4 h-4" aria-hidden="true" />
                Topic Deep Dive
              </div>
              <h2 className="text-xl font-bold text-slate-900">{selected.title}</h2>
              <p className="text-sm text-slate-700 leading-relaxed">{selected.summary}</p>

              <div className="p-3.5 rounded-lg bg-teal-50 border border-teal-200 text-xs text-teal-950">
                <strong>Key Takeaway:</strong> {selected.keyTakeaway}
              </div>

              <div className="space-y-2.5 text-xs text-slate-700 leading-relaxed">
                {selected.details.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </article>

            {/* Glossary */}
            <div className="p-5 rounded-xl border border-slate-200 bg-white">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Quick Glossary</h3>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {GLOSSARY_ITEMS.map((g) => (
                  <div key={g.term} className="p-3 rounded-lg bg-slate-50 border border-slate-200/70">
                    <dt className="font-semibold text-slate-900">{g.term}</dt>
                    <dd className="text-slate-700 mt-1">{g.definition}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* FAQs */}
            <div className="p-5 rounded-xl border border-slate-200 bg-white">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">
                Frequently Asked Questions
              </h3>
              <div className="divide-y divide-slate-100">
                {EDUCATION_FAQS.map((faq, idx) => {
                  const open = openFaq === idx;
                  const panelId = `faq-panel-${idx}`;
                  return (
                    <div key={faq.q} className="py-2 first:pt-0 last:pb-0">
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={panelId}
                        onClick={() => setOpenFaq(open ? null : idx)}
                        className="w-full min-h-[42px] py-1.5 flex items-center justify-between text-left text-xs font-semibold text-slate-900 gap-2"
                      >
                        <span>{faq.q}</span>
                        {open ? (
                          <ChevronUp className="w-4 h-4 shrink-0 text-slate-600" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="w-4 h-4 shrink-0 text-slate-600" aria-hidden="true" />
                        )}
                      </button>
                      {open && (
                        <p id={panelId} className="text-xs text-slate-700 pb-2 mt-1 leading-relaxed">
                          {faq.a}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
