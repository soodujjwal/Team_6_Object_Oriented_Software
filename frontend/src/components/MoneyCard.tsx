import { GlassCard } from "./ui";

type MoneyCardProps = {
  label: string;
  value: string;
  tone?: "default" | "income" | "expense";
};

export function MoneyCard({ label, value, tone = "default" }: MoneyCardProps) {
  return (
    <GlassCard className={`money-card ${tone}`} variant="subtle">
      <span>{label}</span>
      <strong>{value}</strong>
    </GlassCard>
  );
}
