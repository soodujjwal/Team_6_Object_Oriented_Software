import { Tag } from "lucide-react";
import type { TransactionType } from "../../api/types";
import { getCategoriesForType } from "../../domain/transactionCategories";
import { GlassSelect } from "./GlassSelect";

type CategorySelectProps = {
  type: TransactionType;
  value: string;
  onChange: (value: string) => void;
};

export function CategorySelect({ type, value, onChange }: CategorySelectProps) {
  const categories = getCategoriesForType(type);
  return (
    <GlassSelect
      ariaLabel="Category"
      className="category-select-field"
      icon={<Tag size={18} />}
      label="Category"
      onChange={onChange}
      options={categories.map(({ label }) => ({ value: label, label }))}
      value={value}
    />
  );
}
