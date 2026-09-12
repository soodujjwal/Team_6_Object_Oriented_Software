type ProgressBarProps = {
  value: number;
};

export function ProgressBar({ value }: ProgressBarProps) {
  const bounded = Math.min(Math.max(value, 0), 100);
  return (
    <div className="ui-progress" aria-label={`${Math.round(bounded)} percent`}>
      <span style={{ width: `${bounded}%` }} />
    </div>
  );
}
