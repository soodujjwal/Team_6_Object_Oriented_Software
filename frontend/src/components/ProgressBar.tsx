type ProgressBarProps = {
  value: number;
  target?: number;
  label?: string;
};

export function ProgressBar({ value, target, label = "Progress" }: ProgressBarProps) {
  const bounded = Math.min(Math.max(value, 0), 100);
  return (
    <div
      aria-label={label}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={Math.round(bounded)}
      className={`ui-progress${target === undefined ? "" : " has-target"}`}
      role="progressbar"
    >
      <span style={{ width: `${bounded}%` }} />
      {target !== undefined && <i aria-hidden="true" style={{ left: `${Math.min(100, Math.max(0, target))}%` }} />}
    </div>
  );
}
