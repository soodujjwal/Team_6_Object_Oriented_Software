import { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { TextField } from "../ui";

type PasswordInputProps = {
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
  minLength?: number;
  autoComplete?: "current-password" | "new-password";
  name?: string;
};

export function PasswordInput({ label, minLength, onChange, placeholder, value, autoComplete = "current-password", name = "password" }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      action={
        <button
          className="field-action"
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-pressed={visible}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      }
      icon={<Lock size={18} />}
      label={label}
      autoComplete={autoComplete}
      name={name}
      minLength={minLength}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      required
      type={visible ? "text" : "password"}
      value={value}
    />
  );
}

