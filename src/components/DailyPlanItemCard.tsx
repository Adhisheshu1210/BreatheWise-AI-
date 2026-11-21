import { CheckCircle2, Circle, Edit3, RefreshCw } from 'lucide-react';
import type { DailyPlanItem } from '../types/airQuality.ts';

interface DailyPlanItemCardProps {
  item: DailyPlanItem;
  isEditing: boolean;
  editDraft: { time: string; title: string; action: string };
  onChangeDraft: (next: { time: string; title: string; action: string }) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onToggleCompleted: () => void;
  onSwapItem: () => void;
}

export function DailyPlanItemCard({
  item,
  isEditing,
  editDraft,
  onChangeDraft,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onToggleCompleted,
  onSwapItem,
}: DailyPlanItemCardProps) {
  return (
    <div
      className={`p-4 rounded-xl border transition-colors ${
        item.completed ? 'bg-slate-50 border-slate-200 opacity-80' : 'bg-white border-slate-200'
      }`}
    >
      {isEditing ? (
        <div className="space-y-2.5">
          <div className="flex gap-2">
            <input
              type="text"
              aria-label="Edit time slot"
              value={editDraft.time}
              onChange={(e) => onChangeDraft({ ...editDraft, time: e.target.value })}
              className="w-28 px-2.5 py-2 text-xs border border-slate-300 rounded-lg font-mono"
            />
            <input
              type="text"
              aria-label="Edit activity title"
              value={editDraft.title}
              onChange={(e) => onChangeDraft({ ...editDraft, title: e.target.value })}
              className="flex-1 px-2.5 py-2 text-xs border border-slate-300 rounded-lg font-semibold"
            />
          </div>
          <textarea
            rows={2}
            aria-label="Edit recommended action"
            value={editDraft.action}
            onChange={(e) => onChangeDraft({ ...editDraft, action: e.target.value })}
            className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancelEdit}
              className="px-3 py-1.5 min-h-[36px] text-xs text-slate-700 hover:text-slate-900"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSaveEdit}
              className="px-3.5 py-1.5 min-h-[36px] text-xs font-medium text-white bg-slate-900 rounded-lg"
            >
              Save Changes
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <button
            type="button"
            role="checkbox"
            aria-checked={item.completed}
            onClick={onToggleCompleted}
            aria-label={
              item.completed ? `Mark ${item.title} incomplete` : `Mark ${item.title} completed`
            }
            className="p-1.5 -m-1 text-slate-600 hover:text-teal-700 shrink-0 rounded-md"
          >
            {item.completed ? (
              <CheckCircle2 className="w-5 h-5 text-teal-700" aria-hidden="true" />
            ) : (
              <Circle className="w-5 h-5" aria-hidden="true" />
            )}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-baseline gap-2.5">
                <span className="font-mono tabular-nums text-xs font-semibold text-teal-800">
                  {item.time}
                </span>
                <h3
                  className={`text-sm font-semibold ${
                    item.completed ? 'line-through text-slate-500' : 'text-slate-900'
                  }`}
                >
                  {item.title}
                </h3>
              </div>
              <span className="text-[11px] text-slate-500">
                {item.priority} priority · {item.category}
                {item.isAiGenerated ? ' · AI' : ''}
              </span>
            </div>

            <p className="text-xs text-slate-700 mt-1.5 leading-relaxed">{item.action}</p>

            <div className="mt-2 pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-600">
              <div>
                <strong className="text-slate-800">Alternative:</strong> {item.alternative}
              </div>
              <div>
                <strong className="text-slate-800">Why it helps:</strong> {item.explanation}
              </div>
            </div>

            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={onStartEdit}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-900"
              >
                <Edit3 className="w-3 h-3" />
                Edit
              </button>
              <button
                type="button"
                onClick={onSwapItem}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-900"
              >
                <RefreshCw className="w-3 h-3" />
                Swap Recommendation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
