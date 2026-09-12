import { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { TextField } from "../ui";

type PasswordInputProps = {
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
  minLength?: number;
};

export function PasswordInput({ label, minLength, onChange, placeholder, value }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      action={
        <button
          className="field-action"
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={`Toggle ${label} visibility`}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      }
      icon={<Lock size={18} />}
      label={label}
      minLength={minLength}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      required
      type={visible ? "text" : "password"}
      value={value}
    />
  );
}

