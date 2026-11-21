import { ShieldAlert } from 'lucide-react';
import { ChecklistToggleRow } from './UiFeedback.tsx';

const SEVERE_SMOG_CHECKLIST = [
  'Close exterior windows & door gaps during peak haze',
  'Shift outdoor exercise completely indoors today',
  'Run HEPA air filtration in occupied bedrooms if available',
  'Wear a well-fitted N95/FFP2 respirator for unavoidable errands',
  'Keep prescribed respiratory rescue medication accessible',
];

interface SevereSmogBannerProps {
  currentUsAqi: number | null;
  checks: Record<string, boolean>;
  onToggleCheck: (key: string, nextValue: boolean) => void;
  onOpenFamilyShield: () => void;
}

export function SevereSmogBanner({
  currentUsAqi,
  checks,
  onToggleCheck,
  onOpenFamilyShield,
}: SevereSmogBannerProps) {
  return (
    <section
      className="bg-red-50 border border-red-200 rounded-xl p-5 sm:p-6"
      aria-labelledby="severe-smog-heading"
      role="region"
    >
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 text-red-900 font-bold text-sm">
            <ShieldAlert className="w-5 h-5 text-red-700" aria-hidden="true" />
            <h2 id="severe-smog-heading">
              Severe Smog Protection Mode Active (US AQI {currentUsAqi})
            </h2>
          </div>
          <p className="text-xs text-red-900 max-w-2xl leading-relaxed">
            Air pollution is at hazardous levels. Keep sensitive groups indoors, seal leaky
            window drafts, and verify your bedroom clean-air setup. Note: BreatheWise provides
            environmental protection steps and is not a medical service.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenFamilyShield}
          className="px-3.5 py-2.5 min-h-[40px] text-xs font-semibold text-white bg-red-700 hover:bg-red-800 rounded-lg whitespace-nowrap self-start"
        >
          Open Family Shield
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {SEVERE_SMOG_CHECKLIST.map((step, idx) => {
          const key = `severe-${idx}`;
          const done = Boolean(checks[key]);
          return (
            <div key={key} className="p-2.5 rounded-lg bg-white border border-red-200">
              <ChecklistToggleRow
                checked={done}
                label={step}
                onToggle={() => onToggleCheck(key, !done)}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
