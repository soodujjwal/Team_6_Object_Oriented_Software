import { GlassCard } from "./ui";
import type { ReactNode } from "react";

type MoneyCardProps = {
  label: string;
  value: ReactNode;
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
