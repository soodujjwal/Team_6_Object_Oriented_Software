import { useState } from "react";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, ChartNoAxesCombined, Check, ChevronDown, CircleCheck, CreditCard,
  Fingerprint, Goal, Landmark, LayoutDashboard, Link2, LockKeyhole, PiggyBank, Plus, ReceiptText, ShieldCheck,
  Sparkles, Target, Users, Wallet } from "lucide-react";
import "./LandingPage.css";
import { MarketingBrand as Brand, MarketingHeader } from "../components/MarketingHeader";

const budgets = [
  { name: "Food & dining", amount: "$240", total: "$400", percent: 60, icon: ReceiptText },
  { name: "Transport", amount: "$80", total: "$200", percent: 40, icon: CreditCard },
  { name: "Shopping", amount: "$120", total: "$300", percent: 40, icon: Wallet },
];

function ProductPreview() {
  const [view, setView] = useState<"overview" | "split">("overview");
  return <div className="lp-product-scene">
    <div className="lp-orbit lp-orbit-one" aria-hidden="true" /><div className="lp-orbit lp-orbit-two" aria-hidden="true" />
    <div className="lp-product-window">
      <div className="lp-window-bar"><div className="lp-window-dots" aria-hidden="true"><i /><i /><i /></div><span>YOUR MONEY, CONNECTED</span><LockKeyhole size={12} aria-hidden="true" /></div>
      <div className="lp-product-inner">
        <aside className="lp-preview-rail" aria-hidden="true"><span className="lp-rail-brand"><PiggyBank size={23} /></span><span className="is-active"><LayoutDashboard size={18} /></span><span><Wallet size={18} /></span><span><Users size={18} /></span><span><Target size={18} /></span></aside>
        <div className="lp-preview-content">
          <div className="lp-preview-heading"><div><span className="lp-small-label">A little more clarity</span><h3>Your overview<span>.</span></h3></div><span className="lp-example-tag">Example</span></div>
          <div className="lp-preview-switch" role="group" aria-label="Choose a product preview">
            <button type="button" aria-pressed={view === "overview"} onClick={() => setView("overview")}>My money</button>
            <button type="button" aria-pressed={view === "split"} onClick={() => setView("split")}>Shared bills</button>
          </div>
          {view === "overview" ? <div className="lp-preview-panel" key="overview">
            <div className="lp-balance-preview"><span>Estimated balance</span><strong>$4,280<span>.00</span></strong><small><span className="lp-status-dot" />Bank-reported $4,260 + $20 awaiting a match</small></div>
            <div className="lp-preview-totals"><div><span><ArrowDownLeft size={14} /> Income this month</span><strong>$3,200<span>.00</span></strong></div><div><span><ArrowUpRight size={14} /> Personal spending</span><strong>$1,120<span>.00</span></strong></div></div>
            <div className="lp-preview-budget-heading"><strong>Your budgets</strong><span>This month</span></div>
            <div className="lp-preview-budgets">{budgets.map(({ name, amount, total, percent, icon: Icon }) => <div className="lp-preview-budget" key={name}>
              <span className="lp-mini-icon"><Icon size={15} /></span><div><div><span>{name}</span><span><b>{amount}</b> / {total}</span></div><div className="lp-progress"><span style={{ width: `${percent}%` }} /></div></div>
            </div>)}</div>
          </div> : <div className="lp-preview-panel lp-shared-preview" key="split">
            <div className="lp-dinner-icon"><ReceiptText size={24} /></div><span className="lp-small-label">Friday dinner · Example</span><h4>Good food.<br />Fair shares.</h4>
            <div className="lp-shared-total"><span>Bill total</span><strong>$48.00</strong></div>
            {[{ initials: "Y", name: "Your share", status: "$16.00", paid: true }, { initials: "A", name: "Alex", status: "$16 repaid", paid: true }, { initials: "S", name: "Sam", status: "$16 remaining", paid: false }].map((person) => <div className="lp-share-person" key={person.name}>
              <span className="lp-avatar">{person.initials}</span><span>{person.name}</span><small className={person.paid ? "is-paid" : ""}>{person.paid && <Check size={12} />}{person.status}</small>
            </div>)}
            <p><Link2 size={13} /> One bill. One payment. Everything accounted for.</p>
          </div>}
        </div>
      </div>
    </div>
    <div className="lp-floating-note"><span className="lp-floating-icon"><CircleCheck size={20} /></span><div><strong>One clear picture.</strong><span>Bank activity + everyday plans.</span></div><Sparkles size={18} aria-hidden="true" /></div>
    <p className="lp-preview-caption">Illustrative preview · sample amounts, not account data</p>
  </div>;
}

export function LandingPage({ signedIn }: { signedIn: boolean }) {
  const startHref = signedIn ? "/app" : "/register";
  return <div className="lp" id="top">
    <a className="lp-skip" href="#main-content">Skip to content</a>
    <MarketingHeader signedIn={signedIn} />

    <main id="main-content">
      <section className="lp-hero lp-container" aria-labelledby="hero-title">
        <div className="lp-hero-copy">
          <p className="lp-eyebrow"><span className="lp-status-dot" /> YOUR NEXT CHAPTER STARTS HERE</p>
          <h1 id="hero-title">Your money.<br />All connected.<br /><span>All in view.</span></h1>
          <p className="lp-hero-description">Bring your spending, savings, and shared bills into focus. A little less guesswork. A lot more room for what matters.</p>
          <div className="lp-hero-actions"><a className="lp-button" href={startHref}>{signedIn ? "Go to your dashboard" : "Build your financial picture"}<ArrowRight size={18} /></a><a className="lp-text-link" href="#how-it-works">See how it works<ArrowUpRight size={16} /></a></div>
          <div className="lp-hero-benefits"><span><Check size={14} /> Connect with Plaid</span><span><Check size={14} /> Or start manually</span></div>
          <div className="lp-hero-bottom"><span className="lp-line-icon"><ChartNoAxesCombined size={20} /></span><p>Made for everyday money.<br /><strong>And everything you’re building toward.</strong></p></div>
        </div>
        <ProductPreview />
      </section>

      <div className="lp-container"><div className="lp-capabilities" aria-label="Finance Builder capabilities">
        <span>ONE PLACE.<br /><strong>MORE POSSIBILITIES.</strong></span>
        <span><Landmark size={20} /> Bank connections</span><span><ChartNoAxesCombined size={20} /> Smarter budgeting</span><span><Users size={20} /> Shared expenses</span><span><Goal size={20} /> Personal goals</span>
      </div></div>

      <section className="lp-features lp-container lp-section" id="features" aria-labelledby="features-title">
        <div className="lp-section-heading"><div><p className="lp-eyebrow">EVERY PIECE, IN PLACE</p><h2 id="features-title">A clearer picture.<br /><span>A better starting point.</span></h2></div><p>Your financial life doesn’t happen in separate boxes. Your money tools shouldn’t either.</p></div>
        <div className="lp-feature-grid">
          <article className="lp-feature lp-feature-connected"><span className="lp-feature-icon"><Link2 size={23} /></span><div><h3>Bring it all together.</h3><p>Connect your bank through Plaid or add transactions yourself. Match the same payment across both, so your numbers stay in sync.</p></div>
            <div className="lp-connected-visual" aria-label="Bank activity and manual entries connect to one overview"><span><Landmark size={18} /> Bank activity</span><span className="lp-connection-line" aria-hidden="true" /><span className="lp-connection-hub"><PiggyBank size={28} /></span><span className="lp-connection-line" aria-hidden="true" /><span><ReceiptText size={18} /> Manual entries</span></div>
            <span className="lp-feature-caption"><Check size={13} /> More clarity. Fewer duplicate entries.</span>
          </article>
          <article className="lp-feature lp-feature-budget"><span className="lp-feature-icon"><ChartNoAxesCombined size={23} /></span><h3>Give every plan<br />a little structure.</h3><p>Set category budgets and see where your personal spending stands.</p><div className="lp-budget-ring" role="img" aria-label="Example budget: 70 percent used"><div><strong>70<span>%</span></strong><small>of example budget</small></div></div><span className="lp-feature-caption">A plan you can actually see.</span></article>
          <article className="lp-feature lp-feature-split"><span className="lp-feature-icon"><Users size={23} /></span><h3>Share the moment.<br />Split the bill.</h3><p>Fair shares, partial repayments, and a clear view of who still owes what.</p><div className="lp-avatar-stack" aria-hidden="true"><span>YOU</span><span>A</span><span>S</span><span><Plus size={18} /></span></div><span className="lp-feature-caption">Less “who paid?” More peace of mind.</span></article>
          <article className="lp-feature lp-feature-goals"><div><span className="lp-feature-icon"><Target size={23} /></span><h3>Make space for<br />your next big thing.</h3><p>A rainy-day fund. A well-earned trip. Track savings goals and keep your progress in sight.</p></div><div className="lp-goal-example"><div><span className="lp-goal-icon"><PiggyBank size={27} /></span><span className="lp-example-tag">Example goal</span></div><h4>A little breathing room</h4><p>Emergency fund</p><strong>$750 <span>/ $1,000</span></strong><div className="lp-progress"><span style={{ width: "75%" }} /></div><small>Every step counts.</small></div></article>
        </div>
      </section>

      <section className="lp-how lp-section" id="how-it-works" aria-labelledby="how-title"><div className="lp-container">
        <div className="lp-section-heading"><div><p className="lp-eyebrow">FROM SCATTERED TO CONNECTED</p><h2 id="how-title">Your starting point<br /><span>is right here.</span></h2></div><p>Start with what you have.<br />Build a picture that grows with you.</p></div>
        <div className="lp-step-grid">{[
          { number: "01", icon: Fingerprint, title: "Make it yours", description: "Create your account. Your budgets, goals, and shared bills belong to your own financial space." },
          { number: "02", icon: Landmark, title: "Connect your everyday", description: "Link a bank through Plaid, or begin with manual accounts and transactions. You choose how to start." },
          { number: "03", icon: ChartNoAxesCombined, title: "See the bigger picture", description: "Follow your spending, track repayments, and keep upcoming bills and savings plans in view." },
        ].map(({ number, icon: Icon, title, description }) => <article className="lp-step" key={number}><div><span>{number}</span><Icon size={22} /></div><h3>{title}</h3><p>{description}</p></article>)}</div>
      </div></section>

      <section className="lp-container lp-section lp-privacy" id="privacy" aria-labelledby="privacy-title"><div className="lp-privacy-symbol" aria-hidden="true"><div><ShieldCheck size={48} strokeWidth={1.3} /></div><span className="lp-privacy-orbit" /></div><div><p className="lp-eyebrow">CONNECTED WITH CARE</p><h2 id="privacy-title">Your picture.<br /><span>Your personal space.</span></h2><p>Your profile and financial records are tied to your account. Passwords are hashed, and bank connection tokens are encrypted on the server. Bank sign-in happens through Plaid; Finance Builder doesn’t store your bank login password.</p><a className="lp-text-link" href="#questions">A few good questions<ArrowUpRight size={16} /></a></div></section>

      <section className="lp-faq lp-container lp-section" id="questions" aria-labelledby="faq-title"><div><p className="lp-eyebrow">LET’S CLEAR THINGS UP</p><h2 id="faq-title">Good questions.<br /><span>Clear answers.</span></h2><p>A little context before you get started.</p></div><div className="lp-faq-list">{[
        { question: "Do I have to connect a bank?", answer: "No. You can start with manual accounts, income, and expenses. Connecting a bank through Plaid is optional." },
        { question: "Are bank transactions updated instantly?", answer: "Bank updates depend on your institution and Plaid’s synchronization timing. Finance Builder shows bank-reported balances separately from estimates and displays when a bank snapshot was fetched." },
        { question: "Does recording a repayment transfer money?", answer: "No. Finance Builder tracks payments you’ve already made or received. You can record a partial repayment or confirm that an incoming bank transaction belongs to a friend’s share." },
        { question: "What happens when I enter a payment and my bank imports it too?", answer: "Exact, unambiguous matches can be linked automatically. Other possible duplicates are offered for your confirmation, keeping one payment connected to your financial records." },
      ].map(({ question, answer }) => <details key={question}><summary>{question}<ChevronDown size={18} /></summary><p>{answer}</p></details>)}</div></section>

      <section className="lp-container lp-final-wrap"><div className="lp-final"><div><p className="lp-eyebrow">YOUR MONEY. YOUR NEXT MOVE.</p><h2>A little more clarity.<br />A lot more possibility.</h2><p>Start building a financial picture that feels like yours.</p></div><a className="lp-button lp-button-light" href={startHref}>{signedIn ? "Open your dashboard" : "Let’s get started"}<ArrowUpRight size={19} /></a><span className="lp-final-orbit" aria-hidden="true" /></div></section>
    </main>

    <footer className="lp-footer lp-container"><div><a href="/" className="lp-brand-link" aria-label="Finance Builder home"><Brand compact /></a><p>A clearer view of your money.<br />A little more room for life.</p></div><div className="lp-footer-links"><a href="#features">Features</a><a href="#how-it-works">How it works</a><a href="#privacy">Data & privacy</a><a href="#questions">Help & FAQs</a></div><div className="lp-footer-bottom"><span>© {new Date().getFullYear()} Finance Builder</span><span>Built for everyday progress.</span><a href="#top">Back to top<ArrowUpRight size={14} /></a></div></footer>
  </div>;
}
