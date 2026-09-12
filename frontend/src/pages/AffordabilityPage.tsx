import { useState } from "react";
import { DollarSign } from "lucide-react";
import { checkAffordability, type AffordabilityResult } from "../api/affordability";
import { TopBar } from "../components/TopBar";
import { Button, GlassCard, TextField } from "../components/ui";
import { formatCurrency } from "../utils/format";

export function AffordabilityPage() {
  const [amount, setAmount] = useState("");
  const [result, setResult] = useState<AffordabilityResult | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setResult(null);
    try {
      setResult(await checkAffordability(amount));
    } catch {
      setError("Start the backend server to check a purchase.");
    }
  }

  return (
    <section className="page">
      <TopBar title="Can I Afford It?" />
      {error && <p className="notice">{error}</p>}
      <GlassCard>
        <form className="form-stack" onSubmit={handleSubmit}>
          <TextField icon={<DollarSign size={18} />} label="Item / Purchase" min="0" onChange={(event) => setAmount(event.target.value)} placeholder="$750" required step="0.01" type="number" value={amount} />
          <Button type="submit">Check Purchase</Button>
        </form>
      </GlassCard>

      {result && (
        <GlassCard className={`afford-result ${result.can_afford ? "yes" : "no"}`} variant="elevated">
          <h2>{result.can_afford ? "You can afford it" : "Review before buying"}</h2>
          <dl>
            <div><dt>Available</dt><dd>{formatCurrency(result.current_available)}</dd></div>
            <div><dt>Upcoming expenses</dt><dd>{formatCurrency(result.upcoming_required)}</dd></div>
            <div><dt>Savings remaining</dt><dd>{formatCurrency(result.savings_remaining)}</dd></div>
            <div><dt>After purchase</dt><dd>{formatCurrency(result.projected_remaining)}</dd></div>
          </dl>
          <p>{result.message}</p>
        </GlassCard>
      )}
    </section>
  );
}
