export default function ProgressBar({ value, max = 100, color = 'bg-primary', showLabel = true, warningAt = 80 }) {
  const percent = Math.min(Math.round((value / max) * 100), 100);
  const isWarning = percent >= warningAt;

  return (
    <div>
      {showLabel && (
        <div className="flex justify-between text-sm mb-1">
          <span className="text-charcoal/70">{percent}% used</span>
          {isWarning && <span className="text-warning font-semibold">⚠️ Getting close!</span>}
        </div>
      )}
      <div className="w-full h-3 bg-charcoal/10 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isWarning ? 'bg-warning' : color}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
