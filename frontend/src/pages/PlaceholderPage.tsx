import type { LucideIcon } from "lucide-react";
import { TopBar } from "../components/TopBar";
import { GlassCard } from "../components/ui";

type PlaceholderPageProps = {
  description: string;
  icon: LucideIcon;
  title: string;
};

export function PlaceholderPage({ description, icon: Icon, title }: PlaceholderPageProps) {
  return (
    <section className="page">
      <TopBar title={title} />
      <GlassCard className="placeholder-panel" variant="elevated">
        <div className="placeholder-icon">
          <Icon size={30} />
        </div>
        <h1>{title}</h1>
        <p>{description}</p>
      </GlassCard>
    </section>
  );
}
