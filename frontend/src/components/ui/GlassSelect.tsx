import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";

export type GlassSelectOption = {
  value: string;
  label: string;
  leading?: ReactNode;
  disabled?: boolean;
};

type GlassSelectProps = {
  options: GlassSelectOption[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  ariaLabel?: string;
  placeholder?: string;
  icon?: ReactNode;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
  className?: string;
  compact?: boolean;
};

type MenuPosition = CSSProperties & { maxHeight: number };

export function GlassSelect({
  options,
  value,
  onChange,
  label,
  ariaLabel,
  placeholder = "Select an option",
  icon,
  searchable = false,
  searchPlaceholder = "Search options",
  emptyMessage = "No options found.",
  disabled = false,
  loading = false,
  error,
  className = "",
  compact = false,
}: GlassSelectProps) {
  const generatedId = useId();
  const labelId = `${generatedId}-label`;
  const menuId = `${generatedId}-options`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized
      ? options.filter((option) => option.label.toLocaleLowerCase().includes(normalized))
      : options;
  }, [options, query]);
  const selectedOption = options.find((option) => option.value === value);
  const firstEnabledIndex = filteredOptions.findIndex((option) => !option.disabled);
  const selectedIndex = Math.max(0, filteredOptions.findIndex((option) => option.value === value));

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const edge = 12;
    const gap = 6;
    const below = window.innerHeight - rect.bottom - edge - gap;
    const above = rect.top - edge - gap;
    const preferredHeight = Math.min(360, Math.max(150, filteredOptions.length * (compact ? 38 : 44) + (searchable ? 60 : 12)));
    const placeAbove = below < Math.min(240, preferredHeight) && above > below;
    const maxHeight = Math.max(1, Math.min(preferredHeight, placeAbove ? above : below));
    const width = Math.min(rect.width, window.innerWidth - edge * 2);
    const left = Math.max(edge, Math.min(rect.left, window.innerWidth - width - edge));
    const top = placeAbove ? rect.top - maxHeight - gap : rect.bottom + gap;
    setPosition({ left, top: Math.max(edge, Math.min(window.innerHeight - maxHeight - edge, top)), width, maxHeight });
  }, [compact, filteredOptions.length, searchable]);

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    setQuery("");
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const openMenu = useCallback((index = selectedIndex) => {
    if (disabled || loading) return;
    setActiveIndex(index >= 0 ? index : Math.max(0, firstEnabledIndex));
    updatePosition();
    setOpen(true);
  }, [disabled, firstEnabledIndex, loading, selectedIndex, updatePosition]);

  const moveActive = useCallback((delta: number) => {
    if (!filteredOptions.length) return;
    setActiveIndex((current) => {
      let next = current;
      for (let count = 0; count < filteredOptions.length; count += 1) {
        next = (next + delta + filteredOptions.length) % filteredOptions.length;
        if (!filteredOptions[next].disabled) return next;
      }
      return current;
    });
  }, [filteredOptions]);

  const choose = useCallback((option: GlassSelectOption) => {
    if (option.disabled) return;
    onChange(option.value);
    close(true);
  }, [close, onChange]);

  useEffect(() => {
    optionRefs.current = optionRefs.current.slice(0, filteredOptions.length);
    if (activeIndex >= filteredOptions.length || filteredOptions[activeIndex]?.disabled) {
      setActiveIndex(Math.max(0, firstEnabledIndex));
    }
  }, [activeIndex, filteredOptions, firstEnabledIndex]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    if (searchable) requestAnimationFrame(() => searchRef.current?.focus());
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) close();
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [activeIndex, close, open, searchable, updatePosition]);

  useEffect(() => {
    if (!open || searchable) return;
    requestAnimationFrame(() => {
      const activeOption = optionRefs.current[activeIndex];
      activeOption?.scrollIntoView({ block: "nearest" });
      activeOption?.focus();
    });
  }, [activeIndex, open, searchable]);

  useEffect(() => {
    if (open) updatePosition();
  }, [filteredOptions.length, open, updatePosition]);

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (["ArrowDown", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      openMenu(selectedIndex);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openMenu(Math.max(0, filteredOptions.length - 1));
    }
  }

  function handleMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActiveIndex(event.key === "Home" ? Math.max(0, firstEnabledIndex) : filteredOptions.map((option) => option.disabled).lastIndexOf(false));
    } else if (event.key === "Enter" || event.key === " ") {
      const option = filteredOptions[activeIndex];
      if (option) {
        event.preventDefault();
        choose(option);
      }
    } else if (event.key === "Tab") {
      close();
    }
  }

  const trigger = (
    <button
      aria-controls={menuId}
      aria-expanded={open}
      aria-haspopup="listbox"
      aria-label={label ? undefined : ariaLabel}
      aria-labelledby={label ? labelId : undefined}
      className={`ui-field-control glass-select-trigger${compact ? " compact" : ""}${error ? " error" : ""}`}
      disabled={disabled || loading}
      onClick={() => open ? close() : openMenu()}
      onKeyDown={handleTriggerKeyDown}
      ref={triggerRef}
      type="button"
    >
      <span className="glass-select-leading" aria-hidden="true">{selectedOption?.leading ?? icon}</span>
      <span className={`glass-select-value${selectedOption ? "" : " placeholder"}`}>
        {loading ? "Loading..." : selectedOption?.label ?? placeholder}
      </span>
      <ChevronDown aria-hidden="true" className={open ? "rotated" : ""} size={18} />
    </button>
  );

  return (
    <div className={`glass-select${className ? ` ${className}` : ""}`}>
      {label ? <div className="ui-field glass-select-field"><span id={labelId}>{label}</span>{trigger}{error && <small className="field-error">{error}</small>}</div> : trigger}
      {open && position && createPortal(
        <div
          aria-label={label ?? ariaLabel ?? "Options"}
          className={`glass-select-menu${compact ? " compact" : ""}${searchable ? " searchable" : ""}`}
          id={menuId}
          onKeyDown={handleMenuKeyDown}
          ref={menuRef}
          role="listbox"
          style={position}
          tabIndex={-1}
        >
          {searchable && <div className="glass-select-search"><Search aria-hidden="true" size={16} /><input onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} placeholder={searchPlaceholder} ref={searchRef} value={query} /></div>}
          {loading ? <div className="glass-select-message" role="status">Loading options...</div> : filteredOptions.length ? filteredOptions.map((option, index) => (
            <button
              aria-selected={option.value === value}
              className={`glass-select-option${compact ? " compact" : ""}${option.value === value ? " selected" : ""}${index === activeIndex ? " active" : ""}`}
              disabled={option.disabled}
              key={option.value}
              onClick={() => choose(option)}
              onFocus={() => setActiveIndex(index)}
              ref={(node) => { optionRefs.current[index] = node; }}
              role="option"
              type="button"
            >
              {option.leading && <span className="glass-select-option-leading" aria-hidden="true">{option.leading}</span>}
              <span className="glass-select-option-label">{option.label}</span>
              {option.value === value && <Check aria-hidden="true" className="glass-select-check" size={17} />}
            </button>
          )) : <div className="glass-select-message">{emptyMessage}</div>}
        </div>,
        document.body,
      )}
    </div>
  );
}
