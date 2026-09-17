import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

type DatePickerProps = {
  label: string;
  onChange: (value: string) => void;
  required?: boolean;
  value: string;
  hideLabel?: boolean;
  compact?: boolean;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function DatePicker({ label, onChange, required = false, value, hideLabel = false, compact = false }: DatePickerProps) {
  const selectedDate = parseDate(value) ?? new Date();
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
  );
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const edge = 12;
    const gap = 6;
    const width = Math.min(342, window.innerWidth - edge * 2);
    const left = Math.max(edge, Math.min(rect.left, window.innerWidth - width - edge));
    const below = window.innerHeight - rect.bottom - edge - gap;
    const above = rect.top - edge - gap;
    const estimatedHeight = compact ? 336 : 384;
    const placeAbove = below < Math.min(260, estimatedHeight) && above > below;
    const maxHeight = Math.max(220, Math.min(estimatedHeight, placeAbove ? above : below));
    const top = placeAbove ? rect.top - maxHeight - gap : rect.bottom + gap;
    setPosition({
      left,
      top: Math.max(edge, Math.min(window.innerHeight - maxHeight - edge, top)),
      width,
      maxHeight,
    });
  }, [compact]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!pickerRef.current?.contains(target) && !calendarRef.current?.contains(target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && open) {
        event.preventDefault();
        setOpen(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    const nextDate = parseDate(value);
    if (nextDate) {
      setVisibleMonth(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1));
    }
  }, [value]);

  const days = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);
  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(visibleMonth);

  function selectDate(date: Date) {
    onChange(toInputDate(date));
    setOpen(false);
  }

  function selectToday() {
    selectDate(new Date());
  }

  function shiftMonth(amount: number) {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  }

  function toggleCalendar() {
    if (open) {
      setOpen(false);
    } else {
      updatePosition();
      setOpen(true);
    }
  }

  return (
    <div className={`ui-field date-picker${compact ? " compact" : ""}`} ref={pickerRef}>
      {!hideLabel && <span>{label}</span>}
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        className={`ui-field-control date-trigger${compact ? " compact" : ""}`}
        onClick={toggleCalendar}
        ref={triggerRef}
        type="button"
      >
        <CalendarDays size={18} />
        <span className={value ? "" : "date-placeholder"}>
          {value ? formatDisplayDate(value) : required ? "Select date" : "Optional"}
        </span>
        <span />
      </button>

      {open && position && createPortal(
        <div className={`calendar-popover${compact ? " compact" : ""}`} ref={calendarRef} role="dialog" aria-label={`Choose ${label.toLowerCase()}`} style={position}>
          <div className="calendar-header">
            <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month">
              <ChevronLeft size={19} />
            </button>
            <strong>{monthLabel}</strong>
            <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month">
              <ChevronRight size={19} />
            </button>
          </div>

          <div className="calendar-grid weekday-grid">
            {WEEKDAYS.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>

          <div className="calendar-grid">
            {days.map((day) => {
              const isSelected = value === toInputDate(day.date);
              const isToday = toInputDate(new Date()) === toInputDate(day.date);
              return (
                <button
                  className={[
                    day.inCurrentMonth ? "" : "muted",
                    isSelected ? "selected" : "",
                    isToday ? "today" : "",
                  ].join(" ")}
                  key={toInputDate(day.date)}
                  onClick={() => selectDate(day.date)}
                  type="button"
                >
                  {day.date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="calendar-actions">
            <button type="button" onClick={selectToday}>
              Today
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function buildCalendarDays(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date,
      inCurrentMonth: date.getMonth() === month.getMonth(),
    };
  });
}

function parseDate(value: string) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function toInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(value: string) {
  const date = parseDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
