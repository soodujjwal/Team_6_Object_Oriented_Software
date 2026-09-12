import { Check, Phone } from "lucide-react";
import { isValidUsPhoneNumber } from "../utils/phoneNumber";

type PhoneNumberFieldProps = {
  error: string;
  onBlur: () => void;
  onChange: (value: string) => void;
  value: string;
};

export function PhoneNumberField({ error, onBlur, onChange, value }: PhoneNumberFieldProps) {
  const isValid = isValidUsPhoneNumber(value);

  return (
    <label className="ui-field">
      <span>Phone Number</span>
      <div className={`ui-field-control phone-field ${error ? "error" : ""} ${isValid ? "valid" : ""}`}>
        <Phone aria-hidden="true" size={18} />
        <input
          aria-describedby={error ? "phone-number-error" : undefined}
          aria-invalid={Boolean(error)}
          autoComplete="tel-national"
          inputMode="tel"
          onBlur={onBlur}
          onChange={(event) => onChange(event.target.value)}
          placeholder="(555) 123-4567"
          required
          type="tel"
          value={value}
        />
        {isValid ? <Check aria-label="Valid phone number" className="phone-valid-icon" size={18} /> : <span />}
      </div>
      {error && <small className="field-error" id="phone-number-error">{error}</small>}
    </label>
  );
}
