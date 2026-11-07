import { useEffect, useId, useState } from "react";
import { assessPassword, PASSWORD_LABELS } from "../../domain/passwordStrength";
import "./PasswordStrength.css";

export function PasswordStrength({ password, name = "", email = "", phone = "" }: { password: string; name?: string; email?: string; phone?: string }) {
  const id = useId();
  const [assessment, setAssessment] = useState(() => assessPassword(""));
  useEffect(() => {
    const timer = setTimeout(() => setAssessment(assessPassword(password, [name, email, phone])), 150);
    return () => clearTimeout(timer);
  }, [password, name, email, phone]);
  return <div className={`password-strength score-${assessment.score}`}>
    <div className="password-strength-heading"><span id={id}>Password strength</span><strong aria-live="polite">{password ? PASSWORD_LABELS[assessment.score] : "Choose a passphrase"}</strong></div>
    <div className="password-strength-bars" role="meter" aria-labelledby={id} aria-valuemin={0} aria-valuemax={4} aria-valuenow={assessment.score} aria-valuetext={PASSWORD_LABELS[assessment.score]}>
      {PASSWORD_LABELS.map((label, index) => <span key={label} aria-hidden="true" className={password && index <= assessment.score ? "filled" : ""} />)}
    </div>
    <p>15–128 characters · Spaces and Unicode welcome. Strength is an estimate; the server also checks for breached passwords.</p>
    {!!password && assessment.length < 15 && <p>Use a longer password: at least 15 characters.</p>}
    {!!password && assessment.suggestions.length > 0 && <ul>{assessment.suggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}</ul>}
  </div>;
}
