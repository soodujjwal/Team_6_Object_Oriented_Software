import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Landmark, Search } from "lucide-react";
import { BANK_OPTIONS, type BankOption } from "../domain/banks";

type BankSelectorProps = {
  error?: string;
  onChange: (bankName: string) => void;
  value: string;
};

export function BankSelector({ error, onChange, value }: BankSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({});
  const selectorRef = useRef<HTMLLabelElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        !selectorRef.current?.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    function updateDropdownPosition() {
      const trigger = selectorRef.current?.querySelector(".bank-trigger");
      if (!(trigger instanceof HTMLElement)) return;

      const rect = trigger.getBoundingClientRect();
      const viewportPadding = 12;
      const gap = 8;
      const preferredHeight = 344;
      const belowSpace = window.innerHeight - rect.bottom - gap - viewportPadding;
      const aboveSpace = rect.top - gap - viewportPadding;
      const shouldOpenBelow = belowSpace >= 240 || belowSpace >= aboveSpace;
      const availableSpace = shouldOpenBelow ? belowSpace : aboveSpace;
      const maxHeight = Math.max(220, Math.min(preferredHeight, availableSpace));
      const width = Math.min(rect.width, window.innerWidth - viewportPadding * 2);
      const left = Math.min(
        Math.max(rect.left, viewportPadding),
        window.innerWidth - width - viewportPadding,
      );
      const top = shouldOpenBelow
        ? rect.bottom + gap
        : Math.max(viewportPadding, rect.top - gap - maxHeight);

      setDropdownStyle({
        left,
        maxHeight,
        top,
        width,
      });
    }

    updateDropdownPosition();
    window.addEventListener("resize", updateDropdownPosition);
    window.addEventListener("scroll", updateDropdownPosition, true);
    return () => {
      window.removeEventListener("resize", updateDropdownPosition);
      window.removeEventListener("scroll", updateDropdownPosition, true);
    };
  }, [open]);

  const filteredBanks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return BANK_OPTIONS;
    return BANK_OPTIONS.filter((bank) => bank.name.toLowerCase().includes(normalizedQuery));
  }, [query]);
  const selectedBank = BANK_OPTIONS.find((bank) => bank.name === value);

  function selectBank(bankName: string) {
    onChange(bankName);
    setQuery("");
    setOpen(false);
  }

  return (
    <label className="ui-field bank-selector" ref={selectorRef}>
      <span>Select Your Bank</span>
      <button
        aria-expanded={open}
        className={`ui-field-control bank-trigger ${error ? "error" : ""}`}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        {selectedBank ? <BankLogo bank={selectedBank} /> : <Landmark size={18} />}
        <span className={`bank-selected-name ${value ? "" : "bank-placeholder"}`}>
          {value || "Select your bank"}
        </span>
        <ChevronDown size={18} />
      </button>
      {error && <small className="field-error">{error}</small>}

      {open && createPortal(
        <div
          className="bank-dropdown"
          ref={dropdownRef}
          role="listbox"
          aria-label="Bank options"
          style={dropdownStyle}
        >
          <div className="bank-search">
            <Search size={17} />
            <input
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search banks"
              value={query}
            />
          </div>
          <div className="bank-options">
            {filteredBanks.length > 0 ? (
              filteredBanks.map((bank) => {
                const selected = bank.name === value;
                return (
                  <button
                    aria-selected={selected}
                    className={selected ? "selected" : ""}
                    key={bank.id}
                    onClick={() => selectBank(bank.name)}
                    role="option"
                    type="button"
                  >
                    <BankLogo bank={bank} />
                    <span>{bank.name}</span>
                    {selected && <Check size={17} />}
                  </button>
                );
              })
            ) : (
              <p className="bank-empty">No banks found.</p>
            )}
          </div>
        </div>,
        document.body,
      )}
    </label>
  );
}

function BankLogo({ bank }: { bank: BankOption }) {
  return (
    <span className="bank-logo" aria-hidden="true">
      {bank.logoUrl ? (
        <img
          alt=""
          loading="lazy"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
          src={bank.logoUrl}
        />
      ) : (
        <Landmark size={18} />
      )}
    </span>
  );
}
