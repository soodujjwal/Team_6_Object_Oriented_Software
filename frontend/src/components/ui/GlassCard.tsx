import type { HTMLAttributes, ReactNode } from "react";

type GlassCardProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  variant?: "default" | "elevated" | "subtle";
};

export function GlassCard({ children, className = "", variant = "default", ...props }: GlassCardProps) {
  const variantClass = variant === "default" ? "" : variant;
  return (
    <article className={`glass-card ${variantClass} ${className}`.trim()} {...props}>
      {children}
    </article>
  );
}

