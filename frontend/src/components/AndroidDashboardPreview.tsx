import { ArrowDownLeft, ArrowUpRight, Bell, ChartNoAxesCombined, Home, PiggyBank, Plus, ReceiptText, Target, Wallet } from "lucide-react";
import { MoneyCard } from "./MoneyCard";

// Public illustrative data only. This preview never requests a visitor's account.
export function AndroidDashboardPreview() {
  return <figure className="dl-device-scene">
    <div className="dl-device-glow" aria-hidden="true" />
    <div className="dl-phone" role="img" aria-label="Illustrative Finance Builder dashboard with balance, income, spending, transactions and savings. All amounts are sample data.">
      <div className="dl-phone-camera" aria-hidden="true" />
      <div className="dl-phone-status" aria-hidden="true"><span>9:41</span><span>••• ▰</span></div>
      <div className="dl-phone-content" aria-hidden="true">
        <div className="dl-preview-top"><span><PiggyBank size={21} /> Finance Builder</span><Bell size={17} /></div>
        <div className="dl-preview-greeting"><small>Your money, all connected</small><h2>Dashboard</h2><span className="dl-sample-tag">Sample data</span></div>
        <div className="dl-preview-balance"><span>Estimated Balance</span><strong>$4,280<span>.00</span></strong><small><Wallet size={12} /> Your accounts, in one view</small></div>
        <div className="dl-preview-money"><MoneyCard label="Income" value={<><ArrowDownLeft size={13} /> $3,200</>} tone="income" /><MoneyCard label="Spent" value={<><ArrowUpRight size={13} /> $1,120</>} tone="expense" /></div>
        <div className="dl-preview-section"><h3>Recent Transactions</h3><span>View</span></div>
        {[{ name: "Groceries", category: "Food & dining", value: "−$48.50", icon: ReceiptText }, { name: "Monthly salary", category: "Income", value: "+$3,200", icon: Wallet }].map(({ name, category, value, icon: Icon }) => <div className="dl-preview-transaction" key={name}><span><Icon size={16} /></span><div><strong>{name}</strong><small>{category}</small></div><b>{value}</b></div>)}
        <div className="dl-preview-section"><h3>Savings Goals</h3><span>View</span></div>
        <div className="dl-preview-goal"><div><Target size={17} /><strong>Emergency fund</strong><span>$750 / $1,000</span></div><div className="lp-progress"><span style={{ width: "75%" }} /></div></div>
        <div className="dl-phone-nav"><Home size={19} /><ChartNoAxesCombined size={19} /><span><Plus size={20} /></span><Target size={19} /><Wallet size={19} /></div>
      </div>
      <div className="dl-phone-home" aria-hidden="true" />
    </div>
    <figcaption>Finance Builder dashboard · illustrative sample data</figcaption>
  </figure>;
}
