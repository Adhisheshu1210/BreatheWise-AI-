/**
 * Safe React-only line/bold/italic/heading formatter for AI replies without raw HTML injection.
 */
export function FormattedAiText({ text }: { text: string }) {
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
