import { useRef, useState } from "react";
import { PasswordStrength } from "../components/auth/PasswordStrength";
import { passwordProblem } from "../domain/passwordStrength";
import { ArrowLeft, ArrowRight, Mail, UserRound } from "lucide-react";
import { register, type User } from "../api/auth";
import { AuthHeader } from "../components/auth/AuthHeader";
import { AuthLayout } from "../components/auth/AuthLayout";
import { PasswordInput } from "../components/auth/PasswordInput";
import { PhoneNumberField } from "../components/PhoneNumberField";
import { Button, GlassCard, TextField } from "../components/ui";
import { formatUsPhoneNumber, isValidUsPhoneNumber } from "../utils/phoneNumber";

type RegisterPageProps = {
  onRegister: (accessToken: string, user: User) => void | Promise<void>;
  onShowLogin: () => void;
  onShowHome?: () => void;
};

export function RegisterPage({ onRegister, onShowLogin, onShowHome }: RegisterPageProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submissionLock = useRef(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submissionLock.current) return;
    setStatus("");
    if (password !== confirmPassword) {
      setStatus("Passwords do not match.");
      return;
    }
    if (!isValidUsPhoneNumber(phoneNumber)) {
      setPhoneError("Enter a valid US phone number.");
      return;
    }
    const problem = passwordProblem(password, [name, email, phoneNumber]);
    if (problem) { setStatus(problem); return; }
    submissionLock.current = true;
    setSubmitting(true);
    try {
      const session = await register(name, email, phoneNumber, password, confirmPassword);
      await onRegister(session.access_token, session.user);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create account.");
    } finally {
      submissionLock.current = false; setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <GlassCard className="auth-web-card" variant="elevated">
        <button className="auth-back-link" type="button" onClick={onShowHome ?? onShowLogin}>
          <ArrowLeft size={18} /> {onShowHome ? "Back to home" : "Log in"}
        </button>
        <AuthHeader
          title="Create your account"
          subtitle="Start managing your finances today."
        />
        {status && <p className="notice" role="alert">{status}</p>}
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
            minLength={15}
            autoComplete="new-password"
            onChange={setPassword}
            placeholder="Create a password"
            value={password}
          />
          <PasswordStrength password={password} name={name} email={email} phone={phoneNumber} />
          <PasswordInput
            label="Confirm Password"
            minLength={15}
            autoComplete="new-password"
            name="confirm_password"
            onChange={setConfirmPassword}
            placeholder="Confirm password"
            value={confirmPassword}
          />
          <Button className="auth-submit" type="submit" disabled={submitting}>
            {submitting ? "Creating account…" : "Create Account"} <ArrowRight size={18} />
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
