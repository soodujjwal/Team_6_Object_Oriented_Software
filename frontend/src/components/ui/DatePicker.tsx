import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

type DatePickerProps = {
  label: string;
  onChange: (value: string) => void;
  required?: boolean;
  value: string;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function DatePicker({ label, onChange, required = false, value }: DatePickerProps) {
  const selectedDate = parseDate(value) ?? new Date();
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
  );
  const pickerRef = useRef<HTMLLabelElement>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

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

  return (
    <label className="ui-field date-picker" ref={pickerRef}>
      <span>{label}</span>
      <button
        aria-expanded={open}
        className="ui-field-control date-trigger"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <CalendarDays size={18} />
        <span className={value ? "" : "date-placeholder"}>
          {value ? formatDisplayDate(value) : required ? "Select date" : "Optional"}
        </span>
        <span />
      </button>

      {open && (
        <div className="calendar-popover" role="dialog" aria-label="Choose date">
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
        </div>
      )}
    </label>
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
