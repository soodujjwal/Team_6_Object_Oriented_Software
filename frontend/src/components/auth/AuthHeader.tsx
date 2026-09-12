import { PiggyBank } from "lucide-react";

type AuthHeaderProps = {
  title: string;
  subtitle: string;
};

export function AuthHeader({ title, subtitle }: AuthHeaderProps) {
  return (
    <header className="auth-web-header">
      <div className="auth-web-mark">
        <PiggyBank size={42} strokeWidth={1.8} />
      </div>
      <div>
        <p className="auth-brand">Personal Finance Manager</p>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
    </header>
  );
}

