import { useState } from 'react';
import { Info, Plus, Users } from 'lucide-react';
import { ChecklistToggleRow } from '../components/UiFeedback.tsx';
import type { CommunityInitiative } from '../types/airQuality.ts';
import {
  validateCommunityInitiativeInput,
  validatePollutionConcernInput,
} from '../utils/validation.ts';

interface CommunityActionViewProps {
  initiatives: CommunityInitiative[];
  cityName: string;
  onUpdateInitiatives: (next: CommunityInitiative[]) => void;
}

export function CommunityActionView({
  initiatives,
  cityName,
  onUpdateInitiatives,
}: CommunityActionViewProps) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<CommunityInitiative['category']>('carpool');
  const [neighborhood, setNeighborhood] = useState('');
  const [description, setDescription] = useState('');
  const [concernNote, setConcernNote] = useState('');
  const [concernSubmitted, setConcernSubmitted] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [concernError, setConcernError] = useState<string | null>(null);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateCommunityInitiativeInput(title);
    if (!check.valid || !check.value) {
      setCreateError(check.error ?? 'Please enter an initiative title.');
      return;
    }
    setCreateError(null);
    const item: CommunityInitiative = {
      id: `comm-${Date.now()}`,
      title: check.value,
      category,
      neighborhood: neighborhood.trim() || `${cityName} Neighborhood`,
      description:
        description.trim() || 'Community-led clean-air action coordinated locally.',
      participantsCount: 1,
      joinedByMe: true,
      checklist: [
        { id: `chk-${Date.now()}-1`, label: 'Share clean-air goal with 3 neighbors', done: false },
        { id: `chk-${Date.now()}-2`, label: 'Schedule weekly check-in window', done: false },
      ],
      createdAtIso: new Date().toISOString(),
      isLocalDraft: true,
    };
    onUpdateInitiatives([item, ...initiatives]);
    setTitle('');
    setDescription('');
    setNeighborhood('');
  };

  const toggleJoin = (id: string) => {
    onUpdateInitiatives(
      initiatives.map((init) =>
        init.id === id
          ? {
              ...init,
              joinedByMe: !init.joinedByMe,
              participantsCount: init.joinedByMe
                ? Math.max(0, init.participantsCount - 1)
                : init.participantsCount + 1,
            }
          : init
      )
    );
  };

  const toggleTask = (initId: string, taskId: string) => {
    onUpdateInitiatives(
      initiatives.map((init) =>
        init.id === initId
          ? {
              ...init,
              checklist: init.checklist.map((c) =>
                c.id === taskId ? { ...c, done: !c.done } : c
              ),
            }
          : init
      )
    );
  };

  const handleConcernSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const check = validatePollutionConcernInput(concernNote);
    if (!check.valid || !check.value) {
      setConcernError(check.error ?? 'Please describe the observation.');
      return;
    }
    setConcernError(null);
    const reportInitiative: CommunityInitiative = {
      id: `concern-${Date.now()}`,
      title: 'Local Pollution Concern Log (Informational)',
      category: 'concern_report',
      neighborhood: cityName,
      description: check.value,
      participantsCount: 1,
      joinedByMe: true,
      checklist: [
        {
          id: `c-${Date.now()}`,
          label: 'Note time, visible source (e.g., waste burning / dust), and local authority helpline',
          done: true,
        },
      ],
      createdAtIso: new Date().toISOString(),
      isLocalDraft: true,
    };
    onUpdateInitiatives([reportInitiative, ...initiatives]);
    setConcernNote('');
    setConcernSubmitted(true);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6">
        <div className="pb-4 border-b border-slate-100">
          <h1 className="text-xl font-bold text-slate-900">Community Clean-Air Action Center</h1>
          <p className="text-xs text-slate-500 mt-1">
            Organize neighborhood walking groups, school carpools, no-idling pledges, and local
            awareness checklists.
          </p>
        </div>

        <div className="mt-4 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-start gap-2">
          <Info className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
          <span>
            <strong>Local Simulation & Draft Mode:</strong> Community initiatives and participation
            counts shown here are local browser drafts / sample templates—not live external civic
            databases.
          </span>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-5">
            <form
              onSubmit={handleCreate}
              className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
            >
              <h2 className="text-sm font-semibold text-slate-900">Start a Community Goal</h2>
              <div>
                <label htmlFor="comm-title" className="block text-xs font-medium text-slate-700 mb-1">
                  Initiative Title
                </label>
                <input
                  id="comm-title"
                  type="text"
                  aria-invalid={Boolean(createError)}
                  aria-describedby={createError ? 'comm-create-error' : undefined}
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (createError) setCreateError(null);
                  }}
                  placeholder="e.g., Green Lane Carpool Fridays"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                />
              </div>
              <div>
                <label htmlFor="comm-category" className="block text-xs font-medium text-slate-700 mb-1">
                  Category
                </label>
                <select
                  id="comm-category"
                  value={category}
                  onChange={(e) =>
                    setCategory(e.target.value as CommunityInitiative['category'])
                  }
                  className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="carpool">Carpooling Initiative</option>
                  <option value="walking_bus">Walking / Cycling Group</option>
                  <option value="awareness">No-Idling & Awareness</option>
                  <option value="clean_air_zone">Clean-Air School Zone</option>
                </select>
              </div>
              <div>
                <label htmlFor="comm-neighborhood" className="block text-xs font-medium text-slate-700 mb-1">
                  Neighborhood / Street
                </label>
                <input
                  id="comm-neighborhood"
                  type="text"
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                  placeholder="e.g., Sector 14 / Elm Street"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                />
              </div>
              <div>
                <label htmlFor="comm-description" className="block text-xs font-medium text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  id="comm-description"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Practical goal and coordination plan..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                />
              </div>
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" />
                Create Initiative
              </button>
              {createError && (
                <p id="comm-create-error" className="text-xs text-red-700" role="alert">
                  {createError}
                </p>
              )}
            </form>

            <form
              onSubmit={handleConcernSubmit}
              className="p-4 rounded-xl border border-slate-200 bg-white space-y-3"
            >
              <label htmlFor="comm-concern-note" className="block text-sm font-semibold text-slate-900">
                Log Pollution Concern (Informational)
              </label>
              <p className="text-[11px] text-slate-600">
                Document visible waste burning or unmanaged construction dust locally to organize a
                municipal report. This saves locally in your notes.
              </p>
              <textarea
                id="comm-concern-note"
                rows={2}
                aria-invalid={Boolean(concernError)}
                aria-describedby={concernError ? 'comm-concern-error' : undefined}
                value={concernNote}
                onChange={(e) => {
                  setConcernNote(e.target.value);
                  setConcernSubmitted(false);
                  if (concernError) setConcernError(null);
                }}
                placeholder="Describe location & observation (avoid personal identifying details)..."
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <button
                type="submit"
                className="w-full px-3 py-2 min-h-[38px] text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Save Local Concern Note
              </button>
              {concernError && (
                <p id="comm-concern-error" className="text-xs text-red-700" role="alert">
                  {concernError}
                </p>
              )}
              {concernSubmitted && (
                <p role="status" className="text-[11px] text-teal-800 font-medium">
                  Saved locally to your community log. Share with your local municipal pollution
                  helpline as appropriate.
                </p>
              )}
            </form>
          </div>

          <div className="lg:col-span-8 space-y-4">
            {initiatives.map((init) => (
              <div
                key={init.id}
                className="p-4 sm:p-5 rounded-xl border border-slate-200 bg-white space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div>
                    <div className="text-[11px] text-slate-500">
                      {init.neighborhood} · {init.category.replace('_', ' ')} · Local sample/draft
                    </div>
                    <h3 className="text-base font-semibold text-slate-900 mt-0.5">{init.title}</h3>
                  </div>
                  <button
                    type="button"
                    aria-pressed={init.joinedByMe}
                    onClick={() => toggleJoin(init.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg shrink-0 ${
                      init.joinedByMe
                        ? 'bg-teal-700 text-white'
                        : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    {init.joinedByMe ? 'Participating' : 'Join'} ({init.participantsCount})
                  </button>
                </div>

                <p className="text-xs text-slate-700 leading-relaxed">{init.description}</p>

                <div className="pt-2 border-t border-slate-100 space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-600">Action Checklist</div>
                  {init.checklist.map((c) => (
                    <ChecklistToggleRow
                      key={c.id}
                      checked={c.done}
                      label={c.label}
                      onToggle={() => toggleTask(init.id, c.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
