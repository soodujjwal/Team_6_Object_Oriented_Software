import { useState } from "react";
import { ArrowRight, Mail } from "lucide-react";
import { login } from "../api/auth";
import type { User } from "../api/auth";
import { AuthHeader } from "../components/auth/AuthHeader";
import { AuthLayout } from "../components/auth/AuthLayout";
import { PasswordInput } from "../components/auth/PasswordInput";
import { Button, GlassCard, TextField } from "../components/ui";

type LoginPageProps = {
  onLogin: (accessToken: string, user: User) => void;
  onShowRegister: () => void;
};

export function LoginPage({ onLogin, onShowRegister }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("");
    try {
      const session = await login(email, password);
      onLogin(session.access_token, session.user);
    } catch {
      setStatus("Invalid email or password.");
    }
  }

  return (
    <AuthLayout>
      <GlassCard className="auth-web-card" variant="elevated">
        <AuthHeader
          title="Welcome back"
          subtitle="Take control of your money. Build your future."
        />
        {status && <p className="notice">{status}</p>}
        <form className="auth-web-form" onSubmit={handleSubmit}>
          <TextField
            autoFocus
            icon={<Mail size={18} />}
            label="Email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
            type="email"
            value={email}
          />
          <PasswordInput
            label="Password"
            onChange={setPassword}
            placeholder="Enter your password"
            value={password}
          />
          <button className="forgot-link web" type="button">
            Forgot password?
          </button>
          <Button className="auth-submit" type="submit">
            Log In <ArrowRight size={18} />
          </Button>
        </form>

        <div className="auth-divider">
          <span />
          <b>OR</b>
          <span />
        </div>

        <Button variant="secondary" onClick={onShowRegister}>
          Create a new account
        </Button>
      </GlassCard>
    </AuthLayout>
  );
}
