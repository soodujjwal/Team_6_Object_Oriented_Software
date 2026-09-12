import type { InputHTMLAttributes, ReactNode } from "react";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  action?: ReactNode;
  icon?: ReactNode;
  label: string;
};

export function TextField({ action, icon, label, ...props }: TextFieldProps) {
  return (
    <label className="ui-field">
      <span>{label}</span>
      <div className="ui-field-control">
        {icon || <span />}
        <input {...props} />
        {action || <span />}
      </div>
    </label>
  );
}

