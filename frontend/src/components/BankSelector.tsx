import { Landmark } from "lucide-react";
import { BANK_OPTIONS } from "../domain/banks";
import { GlassSelect } from "./ui/GlassSelect";

type BankSelectorProps = {
  error?: string;
  onChange: (bankName: string) => void;
  value: string;
  label?: string;
  inlineMenu?: boolean;
};

export function BankSelector({ error, onChange, value, label = "Select Your Bank", inlineMenu = false }: BankSelectorProps) {
  return (
    <GlassSelect
      ariaLabel="Select your bank"
      error={error}
      icon={<Landmark size={18} />}
      label={label}
      inlineMenu={inlineMenu}
      onChange={onChange}
      options={BANK_OPTIONS.map((bank) => ({
        value: bank.name,
        label: bank.id === "other" && inlineMenu ? "Other bank" : bank.name,
        leading: <BankLogo logoUrl={bank.logoUrl} name={bank.name} />,
      }))}
      placeholder="Select your bank"
      searchable
      searchPlaceholder="Search banks"
      value={value}
    />
  );
}

function BankLogo({ logoUrl, name }: { logoUrl?: string; name: string }) {
  return (
    <span className="bank-logo" aria-hidden="true">
      {logoUrl ? (
        <img alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} src={logoUrl} />
      ) : (
        <Landmark size={18} aria-label={name} />
      )}
    </span>
  );
}
