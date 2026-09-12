import type { ReactNode } from "react";

type AuthLayoutProps = {
  children: ReactNode;
};

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <main className="auth-page">
      <div className="auth-ambient one" />
      <div className="auth-ambient two" />
      <div className="auth-card-wrap">{children}</div>
    </main>
  );
}

