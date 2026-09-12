import { useEffect, useState } from "react";
import { formatCurrency } from "../utils/format";

type Category = "income" | "expenses";

type IncomeExpenseDonutProps = {
  income: number;
  expenses: number;
  netCashFlow: number;
};

const CHART_SIZE = 240;
const CENTER = CHART_SIZE / 2;
const RADIUS = 88;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function IncomeExpenseDonut({ income, expenses, netCashFlow }: IncomeExpenseDonutProps) {
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  useEffect(() => setActiveCategory(null), [income, expenses]);
  const total = income + expenses;
  const isEmpty = total === 0;
  const incomeLength = isEmpty ? 0 : (income / total) * CIRCUMFERENCE;
  const expenseLength = isEmpty ? 0 : (expenses / total) * CIRCUMFERENCE;
  const activeAmount = activeCategory === "income" ? income : expenses;
  const activePercent = total > 0 ? (activeAmount / total) * 100 : 0;

  function selectCategory(category: Category) {
    setActiveCategory(category);
  }

  function handleKeyDown(event: React.KeyboardEvent<SVGCircleElement>, category: Category) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectCategory(category);
    }
    if (event.key === "Escape") setActiveCategory(null);
  }

  function handlePointerEnter(event: React.PointerEvent<SVGCircleElement | HTMLButtonElement>, category: Category) {
    if (event.pointerType === "mouse") setActiveCategory(category);
  }

  function handlePointerLeave(event: React.PointerEvent<SVGCircleElement | HTMLButtonElement>) {
    if (event.pointerType === "mouse") setActiveCategory(null);
  }

  function segmentProps(category: Category, length: number, offset: number) {
    const amount = category === "income" ? income : expenses;
    const percent = total > 0 ? (amount / total) * 100 : 0;
    return {
      "aria-label": `${category === "income" ? "Income" : "Expenses"}: ${formatCurrency(amount)}, ${percent.toFixed(1)} percent`,
      "aria-pressed": activeCategory === category,
      className: `donut-segment ${category} ${activeCategory === category ? "active" : ""}`,
      onClick: () => selectCategory(category),
      onKeyDown: (event: React.KeyboardEvent<SVGCircleElement>) => handleKeyDown(event, category),
      onPointerEnter: (event: React.PointerEvent<SVGCircleElement>) => handlePointerEnter(event, category),
      onPointerLeave: handlePointerLeave,
      role: "button" as const,
      strokeDasharray: `${length} ${Math.max(CIRCUMFERENCE - length, 0)}`,
      strokeDashoffset: offset,
      tabIndex: 0,
    };
  }

  return (
    <div className={`income-expense-chart ${isEmpty ? "empty" : ""}`}>
      <div className="donut-visual">
        <svg
          aria-label="Income and expenses donut chart"
          className="donut-svg"
          role="group"
          viewBox={`0 0 ${CHART_SIZE} ${CHART_SIZE}`}
        >
          <circle className="donut-track" cx={CENTER} cy={CENTER} r={RADIUS} />
          {!isEmpty && (
            <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
              {income > 0 && (
                <circle
                  {...segmentProps("income", incomeLength, 0)}
                  cx={CENTER}
                  cy={CENTER}
                  r={RADIUS}
                />
              )}
              {expenses > 0 && (
                <circle
                  {...segmentProps("expenses", expenseLength, -incomeLength)}
                  cx={CENTER}
                  cy={CENTER}
                  r={RADIUS}
                />
              )}
            </g>
          )}
        </svg>
        <div className="donut-center" aria-live="polite">
          <strong>{formatCurrency(netCashFlow)}</strong>
          <span>{isEmpty ? "No transactions this month" : "Net Cash Flow"}</span>
        </div>
      </div>

      <div aria-live="polite" className="donut-tooltip-slot">
        {activeCategory && !isEmpty && (
          <div className={`donut-tooltip ${activeCategory}`} role="status">
            <span className="donut-tooltip-dot" />
            <strong>{activeCategory === "income" ? "Income" : "Expenses"}</strong>
            <span>{formatCurrency(activeAmount)}</span>
            <small>{activePercent.toFixed(1)}%</small>
          </div>
        )}
      </div>

      <div aria-label="Income and expenses legend" className="donut-legend">
        <LegendItem
          active={activeCategory === "income"}
          amount={income}
          category="income"
          onClick={() => selectCategory("income")}
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
        />
        <LegendItem
          active={activeCategory === "expenses"}
          amount={expenses}
          category="expenses"
          onClick={() => selectCategory("expenses")}
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
        />
      </div>
    </div>
  );
}

type LegendItemProps = {
  active: boolean;
  amount: number;
  category: Category;
  onClick: () => void;
  onPointerEnter: (event: React.PointerEvent<HTMLButtonElement>, category: Category) => void;
  onPointerLeave: (event: React.PointerEvent<HTMLButtonElement>) => void;
};

function LegendItem({ active, amount, category, onClick, onPointerEnter, onPointerLeave }: LegendItemProps) {
  const label = category === "income" ? "Income" : "Expenses";
  return (
    <button
      aria-pressed={active}
      className={`donut-legend-item ${category} ${active ? "active" : ""}`}
      onClick={onClick}
      onPointerEnter={(event) => onPointerEnter(event, category)}
      onPointerLeave={onPointerLeave}
      type="button"
    >
      <span aria-hidden="true" className="donut-legend-dot" />
      <span>{label}</span>
      <strong>{formatCurrency(amount)}</strong>
    </button>
  );
}
