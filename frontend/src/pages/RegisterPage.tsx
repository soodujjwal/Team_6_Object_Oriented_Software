import { useState } from "react";
import { ArrowLeft, ArrowRight, Mail, UserRound } from "lucide-react";
import { register, type User } from "../api/auth";
import { AuthHeader } from "../components/auth/AuthHeader";
import { AuthLayout } from "../components/auth/AuthLayout";
import { PasswordInput } from "../components/auth/PasswordInput";
import { PhoneNumberField } from "../components/PhoneNumberField";
import { Button, GlassCard, TextField } from "../components/ui";
import { formatUsPhoneNumber, isValidUsPhoneNumber } from "../utils/phoneNumber";

type RegisterPageProps = {
  onRegister: (accessToken: string, user: User) => void;
  onShowLogin: () => void;
};

export function RegisterPage({ onRegister, onShowLogin }: RegisterPageProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("");
    if (password !== confirmPassword) {
      setStatus("Passwords do not match.");
      return;
    }
    if (!isValidUsPhoneNumber(phoneNumber)) {
      setPhoneError("Enter a valid US phone number.");
      return;
    }
    try {
      const session = await register(name, email, phoneNumber, password);
      onRegister(session.access_token, session.user);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create account.");
    }
  }

  return (
    <AuthLayout>
      <GlassCard className="auth-web-card" variant="elevated">
        <button className="auth-back-link" type="button" onClick={onShowLogin}>
          <ArrowLeft size={18} /> Log in
        </button>
        <AuthHeader
          title="Create your account"
          subtitle="Start managing your finances today."
        />
        {status && <p className="notice">{status}</p>}
        <form className="auth-web-form" onSubmit={handleSubmit}>
          <TextField
            autoFocus
            icon={<UserRound size={18} />}
            label="Full Name"
            onChange={(event) => setName(event.target.value)}
            placeholder="Alex Morgan"
            required
            value={name}
          />
          <TextField
            icon={<Mail size={18} />}
            label="Email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
            type="email"
            value={email}
          />
          <PhoneNumberField
            error={phoneError}
            onBlur={() => {
              if (!isValidUsPhoneNumber(phoneNumber)) {
                setPhoneError("Enter a valid US phone number.");
              }
            }}
            onChange={(value) => {
              const formatted = formatUsPhoneNumber(value);
              setPhoneNumber(formatted);
              if (isValidUsPhoneNumber(formatted)) setPhoneError("");
            }}
            value={phoneNumber}
          />
          <PasswordInput
            label="Password"
            minLength={8}
            onChange={setPassword}
            placeholder="Create a password"
            value={password}
          />
          <PasswordInput
            label="Confirm Password"
            minLength={8}
            onChange={setConfirmPassword}
            placeholder="Confirm password"
            value={confirmPassword}
          />
          <Button className="auth-submit" type="submit">
            Create Account <ArrowRight size={18} />
          </Button>
        </form>
        <p className="terms-copy web">
          By creating an account, you agree to our Terms of Service and Privacy Policy.
        </p>
        <button className="text-button" type="button" onClick={onShowLogin}>
          Already have an account? Log in
        </button>
      </GlassCard>
    </AuthLayout>
  );
}
