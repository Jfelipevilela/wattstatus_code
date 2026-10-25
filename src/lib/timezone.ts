// Month and day boundaries in a property's IANA time zone. Without a zone,
// everything falls back to the browser's zone (the behaviour before
// properties had one), so older views read exactly as before.

const formatters = new Map<string, Intl.DateTimeFormat>();

const formatter = (timeZone: string) => {
  let format = formatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, format);
  }
  return format;
};

export const isValidTimeZone = (timeZone: string | null | undefined): timeZone is string => {
  if (!timeZone) return false;
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
};

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export const zonedParts = (date: Date, timeZone?: string | null): ZonedParts => {
  if (!isValidTimeZone(timeZone)) {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
    };
  }
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
};

// Milliseconds the zone is ahead of UTC at a given instant (DST aware).
const offsetAt = (instant: number, timeZone: string) => {
  const p = zonedParts(new Date(instant), timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instant / 1000) * 1000;
};

// First instant of the local day `year-month-day 00:00` in the zone. Where
// midnight does not exist (DST starting at 00:00) this is the first valid
// moment of that day.
export const zonedStartOfDay = (year: number, month: number, day: number, timeZone?: string | null) => {
  if (!isValidTimeZone(timeZone)) return new Date(year, month - 1, day);
  const wall = Date.UTC(year, month - 1, day);
  let instant = wall - offsetAt(wall, timeZone);
  instant = wall - offsetAt(instant, timeZone);
  const check = zonedParts(new Date(instant), timeZone);
  if (check.day !== day && check.hour > 12) instant += 3600000;
  return new Date(instant);
};

export const zonedMonthRange = (year: number, month: number, timeZone?: string | null) => {
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return {
    start: zonedStartOfDay(year, month, 1, timeZone),
    end: zonedStartOfDay(next.year, next.month, 1, timeZone),
  };
};

// "YYYY-MM" of an instant in the zone. Intervals are filed by their end.
export const zonedMonthKey = (date: Date | string, timeZone?: string | null) => {
  const parts = zonedParts(typeof date === "string" ? new Date(date) : date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
};

export const shiftMonth = (year: number, month: number, delta: number) => {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
};
