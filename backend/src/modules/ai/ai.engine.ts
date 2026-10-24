// WattStatus AI analytics engine. Pure, deterministic functions: every number
// the assistant shows comes from here, never from the language model.
import type { ApplianceRecord, PropertyRecord, RoomRecord } from "../../types";
import type { EnergyInterval } from "../energy/energy-history";
import { estimateMonthly } from "../properties/properties.service";
import { STATE_TARIFFS } from "../../config/tariffs";

export const ENGINE_VERSION = "ai-engine-1";

export type EnergyDataSource =
  | "measured"
  | "measured_partial"
  | "estimated"
  | "projected"
  | "simulated"
  | "unavailable";

const round = (value: number, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};
export const money = (value: number) => round(value, 2);
export const brlRate = (value: number) => value.toFixed(2).replace(".", ",");
export const kwh = (value: number) => round(value, value >= 100 ? 0 : value >= 10 ? 1 : 2);

// ---------------------------------------------------------------- calendar

// Building an Intl.DateTimeFormat is far slower than using one, and these run
// once per energy reading; keep one formatter per zone and pattern.
const formatters = new Map<string, Intl.DateTimeFormat>();
const formatter = (locale: string, options: Intl.DateTimeFormatOptions) => {
  const key = `${locale}|${options.timeZone}|${options.hour ? "time" : "day"}`;
  let cached = formatters.get(key);
  if (!cached) { cached = new Intl.DateTimeFormat(locale, options); formatters.set(key, cached); }
  return cached;
};

// Calendar parts of an instant in the property's time zone.
export const zonedDay = (date: Date, timeZone: string) => {
  try {
    const parts = formatter("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(date);
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    return { year: get("year"), month: get("month"), day: get("day") };
  } catch {
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
  }
};
const dayKey = (date: Date, timeZone: string) => {
  const { year, month, day } = zonedDay(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};
const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

// Offset of the zone at an instant, in ms (handles DST transitions).
const zoneOffset = (date: Date, timeZone: string) => {
  try {
    const parts = formatter("en-US", {
      timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(date);
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) -
      Math.floor(date.getTime() / 1000) * 1000;
  } catch {
    return 0;
  }
};
// Midnight of a local calendar day as a UTC instant.
export const zonedMidnight = (year: number, month: number, day: number, timeZone: string) => {
  const guess = Date.UTC(year, month - 1, day);
  const first = guess - zoneOffset(new Date(guess), timeZone);
  return new Date(guess - zoneOffset(new Date(first), timeZone));
};

export interface MonthPeriod {
  start: Date;
  end: Date;
  previousStart: Date;
  daysInMonth: number;
  daysElapsed: number;
  previousDays: number;
  timeZone: string;
}
// A given calendar month; past months count as fully elapsed.
export const monthPeriodFor = (year: number, month: number, timeZone: string, now = new Date()): MonthPeriod => {
  const current = zonedDay(now, timeZone);
  if (year === current.year && month === current.month) return monthPeriod(now, timeZone);
  const period = monthPeriod(zonedMidnight(year, month, 15, timeZone), timeZone);
  const future = year > current.year || (year === current.year && month > current.month);
  return { ...period, daysElapsed: future ? 0 : period.daysInMonth };
};

export const monthPeriod = (now: Date, timeZone: string): MonthPeriod => {
  const { year, month, day } = zonedDay(now, timeZone);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    start: zonedMidnight(year, month, 1, timeZone),
    end: zonedMidnight(nextYear, nextMonth, 1, timeZone),
    previousStart: zonedMidnight(prevYear, prevMonth, 1, timeZone),
    daysInMonth: daysInMonth(year, month),
    // Today counts as a partial day; full days observed so far.
    daysElapsed: Math.max(0, day - 1),
    previousDays: daysInMonth(prevYear, prevMonth),
    timeZone,
  };
};

// ---------------------------------------------------------------- tariffs

// Same precedence as the existing estimate: appliance tariff, then the rate
// implied by its stored calculation, then the state table, then the property.
export const applianceRate = (appliance: ApplianceRecord, property?: PropertyRecord | null) => {
  if (typeof appliance.tariffValue === "number" && appliance.tariffValue > 0) {
    return { rate: appliance.tariffValue, origin: "aparelho" as const };
  }
  if (appliance.monthlyConsumption > 0 && appliance.monthlyCost > 0) {
    return { rate: appliance.monthlyCost / appliance.monthlyConsumption, origin: "aparelho" as const };
  }
  const state = STATE_TARIFFS[appliance.tariff];
  if (state) return { rate: state, origin: "estado" as const };
  if (property?.tariffValue) return { rate: property.tariffValue, origin: "imovel" as const };
  if (property?.tariffState && STATE_TARIFFS[property.tariffState]) {
    return { rate: STATE_TARIFFS[property.tariffState], origin: "imovel" as const };
  }
  return { rate: 0, origin: "indisponivel" as const };
};

// ---------------------------------------------------------------- snapshot

export interface ApplianceFacts {
  id: string;
  name: string;
  roomId: string | null;
  roomName: string | null;
  power: number;
  usageHours: number;
  days: number;
  rate: number;
  rateOrigin: string;
  estimatedKWh: number;
  estimatedCost: number;
  share: number;
  measuredKWh: number | null;
  measuredCost: number | null;
  measuredDays: number;
  lastReadingAt: string | null;
  connected: boolean;
  cyclic: boolean;
  essential: boolean;
}
export interface RoomFacts {
  id: string;
  name: string;
  type: string;
  applianceCount: number;
  estimatedKWh: number;
  estimatedCost: number;
  share: number;
  measuredKWh: number;
}
export interface DailyPoint { day: string; kWh: number; cost: number }
export interface PropertySnapshot {
  version: string;
  property: { id: string; name: string; timezone: string; isPrimary: boolean };
  period: { start: string; end: string; daysInMonth: number; daysElapsed: number; previousDays: number; timezone: string };
  appliances: ApplianceFacts[];
  rooms: RoomFacts[];
  unassigned: { applianceCount: number; estimatedKWh: number; estimatedCost: number };
  totals: {
    applianceCount: number;
    estimatedKWh: number;
    estimatedCost: number;
    measuredKWh: number;
    measuredCost: number;
    measuredApplianceCount: number;
    connectedApplianceCount: number;
    previousMeasuredKWh: number;
    previousMeasuredCost: number;
    // Share of the estimated consumption that belongs to appliances with readings.
    coverage: number;
  };
  daily: DailyPoint[];
  previousDaily: DailyPoint[];
  missingPower: string[];
}

const CYCLIC = /(ar.?condicionado|split|geladeira|refrigerador|freezer|frigobar|bebedouro|aquecedor|boiler|bomba)/;
const ESSENTIAL = /(geladeira|refrigerador|freezer|frigobar|bomba|alarme|camera|câmera|roteador|modem|nobreak|cpap|medic)/;
export const normalize = (text: string) =>
  text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

export const isCyclic = (name: string) => CYCLIC.test(normalize(name));
export const isEssential = (name: string) => ESSENTIAL.test(normalize(name));

const aggregateDaily = (intervals: EnergyInterval[], timeZone: string, rates: Map<string, number>) => {
  const map = new Map<string, DailyPoint>();
  for (const item of intervals) {
    const key = dayKey(new Date(item.endAt), timeZone);
    const point = map.get(key) ?? { day: key, kWh: 0, cost: 0 };
    point.kWh += item.consumptionKWh;
    const rate = item.tariffValue ?? (item.applianceId ? rates.get(item.applianceId) : undefined) ?? 0;
    point.cost += item.cost ?? item.consumptionKWh * rate;
    map.set(key, point);
  }
  return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
};

export interface SnapshotInput {
  property: PropertyRecord;
  rooms: RoomRecord[];
  appliances: ApplianceRecord[];
  intervals: EnergyInterval[];
  previousIntervals: EnergyInterval[];
  period: MonthPeriod;
}

export const buildSnapshot = ({ property, rooms, appliances, intervals, previousIntervals, period }: SnapshotInput): PropertySnapshot => {
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const own = appliances.filter((item) => item.propertyId === property.id);
  const ownIds = new Set(own.map((item) => item.id));
  const located = intervals.filter((item) => item.applianceId && ownIds.has(item.applianceId) &&
    (!item.propertyId || item.propertyId === property.id));
  const previousLocated = previousIntervals.filter((item) => item.applianceId && ownIds.has(item.applianceId) &&
    (!item.propertyId || item.propertyId === property.id));
  const rates = new Map<string, number>();
  const byAppliance = new Map<string, EnergyInterval[]>();
  for (const item of located) {
    const list = byAppliance.get(item.applianceId!);
    if (list) list.push(item); else byAppliance.set(item.applianceId!, [item]);
  }

  const facts: ApplianceFacts[] = own.map((appliance) => {
    const estimate = estimateMonthly(appliance, period.daysInMonth);
    const { rate, origin } = applianceRate(appliance, property);
    rates.set(appliance.id, rate);
    const readings = byAppliance.get(appliance.id) ?? [];
    const measured = readings.reduce((sum, item) => sum + item.consumptionKWh, 0);
    const measuredCost = readings.reduce((sum, item) => sum + (item.cost ?? item.consumptionKWh * rate), 0);
    const days = new Set(readings.map((item) => dayKey(new Date(item.endAt), period.timeZone)));
    const last = readings.reduce<string | null>((max, item) => (!max || item.endAt > max ? item.endAt : max), null);
    const roomId = appliance.roomId && roomById.has(appliance.roomId) ? appliance.roomId : null;
    return {
      id: appliance.id,
      name: appliance.name,
      roomId,
      roomName: roomId ? roomById.get(roomId)!.name : null,
      power: appliance.power,
      usageHours: appliance.usageHours,
      days: Math.min(appliance.days, period.daysInMonth),
      rate,
      rateOrigin: origin,
      estimatedKWh: estimate.consumption,
      estimatedCost: estimate.consumption * rate,
      share: 0,
      measuredKWh: readings.length ? measured : null,
      measuredCost: readings.length ? measuredCost : null,
      measuredDays: days.size,
      lastReadingAt: last,
      connected: Boolean(appliance.integrationProvider && appliance.integrationDeviceId),
      cyclic: isCyclic(appliance.name),
      essential: isEssential(appliance.name),
    };
  });

  const estimatedKWh = facts.reduce((sum, item) => sum + item.estimatedKWh, 0);
  const estimatedCost = facts.reduce((sum, item) => sum + item.estimatedCost, 0);
  for (const item of facts) item.share = estimatedCost > 0 ? item.estimatedCost / estimatedCost : 0;

  const roomFacts: RoomFacts[] = rooms.map((room) => {
    const inRoom = facts.filter((item) => item.roomId === room.id);
    const cost = inRoom.reduce((sum, item) => sum + item.estimatedCost, 0);
    return {
      id: room.id,
      name: room.name,
      type: room.type,
      applianceCount: inRoom.length,
      estimatedKWh: inRoom.reduce((sum, item) => sum + item.estimatedKWh, 0),
      estimatedCost: cost,
      share: estimatedCost > 0 ? cost / estimatedCost : 0,
      measuredKWh: inRoom.reduce((sum, item) => sum + (item.measuredKWh ?? 0), 0),
    };
  });
  const unassigned = facts.filter((item) => !item.roomId);
  const measuredFacts = facts.filter((item) => item.measuredKWh !== null);
  const measuredEstimate = measuredFacts.reduce((sum, item) => sum + item.estimatedKWh, 0);

  return {
    version: ENGINE_VERSION,
    property: { id: property.id, name: property.name, timezone: period.timeZone, isPrimary: property.isPrimary },
    period: {
      start: period.start.toISOString(),
      end: period.end.toISOString(),
      daysInMonth: period.daysInMonth,
      daysElapsed: period.daysElapsed,
      previousDays: period.previousDays,
      timezone: period.timeZone,
    },
    appliances: facts.sort((a, b) => b.estimatedCost - a.estimatedCost),
    rooms: roomFacts.sort((a, b) => b.estimatedCost - a.estimatedCost),
    unassigned: {
      applianceCount: unassigned.length,
      estimatedKWh: unassigned.reduce((sum, item) => sum + item.estimatedKWh, 0),
      estimatedCost: unassigned.reduce((sum, item) => sum + item.estimatedCost, 0),
    },
    totals: {
      applianceCount: facts.length,
      estimatedKWh,
      estimatedCost,
      measuredKWh: measuredFacts.reduce((sum, item) => sum + (item.measuredKWh ?? 0), 0),
      measuredCost: measuredFacts.reduce((sum, item) => sum + (item.measuredCost ?? 0), 0),
      measuredApplianceCount: measuredFacts.length,
      connectedApplianceCount: facts.filter((item) => item.connected).length,
      previousMeasuredKWh: previousLocated.reduce((sum, item) => sum + item.consumptionKWh, 0),
      previousMeasuredCost: previousLocated.reduce((sum, item) => sum + (item.cost ?? item.consumptionKWh * (rates.get(item.applianceId!) ?? 0)), 0),
      coverage: estimatedKWh > 0 ? Math.min(1, measuredEstimate / estimatedKWh) : 0,
    },
    daily: aggregateDaily(located, period.timeZone, rates),
    previousDaily: aggregateDaily(previousLocated, period.timeZone, rates),
    missingPower: facts.filter((item) => !(item.power > 0)).map((item) => item.name),
  };
};

// Origin of the snapshot's measured totals.
export const measuredSource = (snapshot: PropertySnapshot): EnergyDataSource => {
  const { measuredApplianceCount, applianceCount } = snapshot.totals;
  if (!measuredApplianceCount) return "unavailable";
  return measuredApplianceCount >= applianceCount ? "measured" : "measured_partial";
};

// ---------------------------------------------------------------- statistics

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
export const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
export const mad = (values: number[]) => {
  const m = median(values);
  return median(values.map((value) => Math.abs(value - m)));
};
const stdev = (values: number[]) => {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - m) ** 2, 0) / (values.length - 1));
};

// ---------------------------------------------------------------- forecast

export interface Forecast {
  status: "ok" | "insufficient_data";
  source: EnergyDataSource;
  method: "pace_7d" | "pace_month" | "estimate" | "none";
  kWh: number | null;
  cost: number | null;
  low: number | null;
  high: number | null;
  daysObserved: number;
  backtest: { method: string; wape: number; baselineWape: number } | null;
  reason?: string;
}

// Mean absolute error relative to the actual total (WAPE) of predicting each
// of the last `holdout` days with the mean of the 7 days before it, against
// the naive "mean of everything before" baseline.
export const backtestDailyPace = (daily: number[], holdout = 7) => {
  if (daily.length < holdout + 7) return null;
  let errPace = 0, errBase = 0, actual = 0;
  for (let i = daily.length - holdout; i < daily.length; i++) {
    const history = daily.slice(0, i);
    const pace = mean(history.slice(-7));
    const base = mean(history);
    errPace += Math.abs(daily[i] - pace);
    errBase += Math.abs(daily[i] - base);
    actual += daily[i];
  }
  if (actual <= 0) return null;
  return { method: "pace_7d", wape: errPace / actual, baselineWape: errBase / actual };
};

// Month-end forecast from the observed pace. Only for fully measured homes:
// a partial measurement is never presented as the whole home's total.
export const forecastMonth = (snapshot: PropertySnapshot): Forecast => {
  const source = measuredSource(snapshot);
  const { daysInMonth, daysElapsed } = snapshot.period;
  const observed = snapshot.daily.filter((point) => point.day < dayKey(new Date(), snapshot.period.timezone));
  const remaining = Math.max(0, daysInMonth - daysElapsed);
  if (source === "measured" && observed.length >= 5) {
    const values = observed.map((point) => point.kWh);
    const costs = observed.map((point) => point.cost);
    const recent = values.slice(-7);
    const paceKWh = mean(recent);
    const paceCost = mean(costs.slice(-7));
    const soFarKWh = snapshot.totals.measuredKWh;
    const soFarCost = snapshot.totals.measuredCost;
    const spread = stdev(recent) * Math.sqrt(remaining);
    const unitCost = paceKWh > 0 ? paceCost / paceKWh : 0;
    const total = soFarKWh + paceKWh * remaining;
    return {
      status: "ok",
      source: "projected",
      method: recent.length >= 7 ? "pace_7d" : "pace_month",
      kWh: total,
      cost: soFarCost + paceCost * remaining,
      low: Math.max(soFarKWh, total - 1.64 * spread) * unitCost || null,
      high: (total + 1.64 * spread) * unitCost || null,
      daysObserved: observed.length,
      backtest: backtestDailyPace(values.concat()),
    };
  }
  if (snapshot.totals.applianceCount > 0 && snapshot.totals.estimatedKWh > 0) {
    return {
      status: "ok",
      source: "estimated",
      method: "estimate",
      kWh: snapshot.totals.estimatedKWh,
      cost: snapshot.totals.estimatedCost,
      low: null,
      high: null,
      daysObserved: observed.length,
      backtest: null,
      reason: source === "measured_partial"
        ? "Só parte dos aparelhos tem medição; a previsão usa as horas e potências cadastradas."
        : "Sem medições suficientes; a previsão usa as horas e potências cadastradas.",
    };
  }
  return {
    status: "insufficient_data", source: "unavailable", method: "none",
    kWh: null, cost: null, low: null, high: null, daysObserved: observed.length, backtest: null,
    reason: "Não há aparelhos com potência cadastrada nem medições neste imóvel.",
  };
};

// ---------------------------------------------------------------- periods

export interface PeriodComparison {
  status: "ok" | "insufficient_data";
  source: EnergyDataSource;
  currentPerDay: number | null;
  previousPerDay: number | null;
  change: number | null;
  currentDays: number;
  previousDays: number;
  reason?: string;
}
// Compares the daily average of measured days, so a half month is never set
// against a full one.
export const comparePeriods = (snapshot: PropertySnapshot): PeriodComparison => {
  const current = snapshot.daily;
  const previous = snapshot.previousDaily;
  if (current.length < 3 || previous.length < 7) {
    return {
      status: "insufficient_data", source: "unavailable", currentPerDay: null, previousPerDay: null,
      change: null, currentDays: current.length, previousDays: previous.length,
      reason: "São necessários pelo menos 3 dias medidos neste mês e 7 no mês anterior.",
    };
  }
  const currentPerDay = mean(current.map((point) => point.kWh));
  const previousPerDay = mean(previous.map((point) => point.kWh));
  return {
    status: "ok",
    source: measuredSource(snapshot),
    currentPerDay,
    previousPerDay,
    change: previousPerDay > 0 ? (currentPerDay - previousPerDay) / previousPerDay : null,
    currentDays: current.length,
    previousDays: previous.length,
  };
};

// ---------------------------------------------------------------- anomalies

export type AnomalyKind = "consumption_spike" | "baseline_increase" | "measurement_gap" | "inconsistent_reading";
export interface Anomaly {
  id: string;
  kind: AnomalyKind;
  title: string;
  detail: string;
  day?: string;
  applianceId?: string;
  value?: number;
  reference?: number;
  severity: "info" | "attention";
}
const ROBUST_Z = 3.5;
const MIN_ABS_KWH = 0.5;
export const detectAnomalies = (snapshot: PropertySnapshot, now = new Date()): Anomaly[] => {
  const found: Anomaly[] = [];
  const series = [...snapshot.previousDaily, ...snapshot.daily];
  if (series.length >= 14) {
    const reference = series.slice(0, -3).map((point) => point.kWh);
    const m = median(reference);
    const spread = mad(reference) * 1.4826;
    const recent = series.slice(-3);
    for (const point of recent) {
      const z = spread > 0 ? (point.kWh - m) / spread : 0;
      if (z > ROBUST_Z && point.kWh - m > MIN_ABS_KWH) {
        found.push({
          id: `spike:${snapshot.property.id}:${point.day}`,
          kind: "consumption_spike",
          title: "Consumo medido acima do padrão",
          detail: `Em ${point.day} os aparelhos medidos somaram ${kwh(point.kWh)} kWh; a mediana dos dias anteriores é ${kwh(m)} kWh.`,
          day: point.day, value: point.kWh, reference: m, severity: "attention",
        });
      }
    }
    // Persistent increase: last 7 days median well above the 21 before them.
    if (series.length >= 28) {
      const last = median(series.slice(-7).map((point) => point.kWh));
      const before = median(series.slice(-28, -7).map((point) => point.kWh));
      if (before > 0 && last > before * 1.25 && last - before > MIN_ABS_KWH) {
        found.push({
          id: `baseline:${snapshot.property.id}:${series[series.length - 1].day}`,
          kind: "baseline_increase",
          title: "Aumento persistente do consumo medido",
          detail: `A mediana diária dos últimos 7 dias (${kwh(last)} kWh) está ${Math.round((last / before - 1) * 100)}% acima das 3 semanas anteriores (${kwh(before)} kWh).`,
          value: last, reference: before, severity: "attention",
        });
      }
    }
  }
  for (const item of snapshot.appliances) {
    if (!item.connected) continue;
    const silentHours = item.lastReadingAt ? (now.getTime() - new Date(item.lastReadingAt).getTime()) / 3600000 : Infinity;
    if (silentHours > 48) {
      found.push({
        id: `gap:${item.id}:${item.lastReadingAt ?? "never"}`,
        kind: "measurement_gap",
        title: `${item.name} sem leitura recente`,
        detail: item.lastReadingAt
          ? `A última leitura deste mês foi em ${item.lastReadingAt.slice(0, 10)}. Pode ser aparelho desligado, offline ou falha de coleta.`
          : "O aparelho está conectado, mas não há leituras neste mês. Pode ser aparelho desligado, offline ou falha de coleta.",
        applianceId: item.id, severity: "info",
      });
    }
    // Measured far above what is physically possible for the registered power.
    if (item.measuredKWh !== null && item.power > 0 && item.measuredDays > 0) {
      const ceiling = (item.power / 1000) * 24 * item.measuredDays;
      if (item.measuredKWh > ceiling * 1.5) {
        found.push({
          id: `inconsistent:${item.id}:${snapshot.period.start.slice(0, 7)}`,
          kind: "inconsistent_reading",
          title: `Leitura de ${item.name} incompatível com a potência cadastrada`,
          detail: `Medido ${kwh(item.measuredKWh)} kWh em ${item.measuredDays} dia(s), acima do máximo de ${kwh(ceiling)} kWh para ${item.power} W ligados 24 h. Revise a potência cadastrada ou o vínculo do dispositivo.`,
          applianceId: item.id, severity: "attention",
        });
      }
    }
  }
  return found;
};

// ---------------------------------------------------------------- simulations

export interface Scenario { label: "conservador" | "central" | "otimista"; factor: number; kWh: number; cost: number }
export interface UsageSimulation {
  kind: "usage_reduction";
  source: EnergyDataSource;
  applianceId?: string;
  applianceName?: string;
  power: number;
  effectivePowerW: number;
  currentHours: number;
  proposedHours: number;
  daysPerMonth: number;
  rate: number;
  before: { kWh: number; cost: number };
  after: { kWh: number; cost: number };
  savings: { dailyKWh: number; dailyCost: number; monthlyKWh: number; monthlyCost: number; annualKWh: number; annualCost: number; percent: number };
  scenarios: Scenario[];
  assumptions: string[];
  warnings: string[];
}

export interface UsageSimulationInput {
  power: number;
  currentHours: number;
  proposedHours: number;
  daysPerMonth: number;
  rate: number;
  cyclic?: boolean;
  // Average power implied by measurements, when there are enough of them.
  measuredAveragePowerW?: number | null;
  applianceId?: string;
  applianceName?: string;
}

// Compressor appliances do not draw nominal power the whole time. The central
// scenario keeps the registered power (the same basis as every estimate in
// the app); the conservative one assumes the compressor runs half the time.
const CYCLIC_FACTORS = { conservador: 0.5, central: 1 };

export const simulateUsage = (input: UsageSimulationInput): UsageSimulation => {
  const warnings: string[] = [];
  const assumptions: string[] = [];
  const currentHours = Math.max(0, Math.min(24, input.currentHours));
  let proposedHours = Math.max(0, Math.min(24, input.proposedHours));
  if (proposedHours > currentHours) {
    warnings.push("As horas propostas são maiores que as atuais; a simulação mostra aumento de consumo.");
  }
  if (input.proposedHours < 0) {
    warnings.push("Não é possível reduzir além do tempo de uso cadastrado; a redução foi limitada a zero hora.");
    proposedHours = 0;
  }
  const days = Math.max(0, Math.min(31, input.daysPerMonth));
  const measured = input.measuredAveragePowerW && input.measuredAveragePowerW > 0 ? input.measuredAveragePowerW : null;
  const effectivePowerW = measured ?? input.power;
  const source: EnergyDataSource = measured ? "simulated" : input.power > 0 ? "simulated" : "unavailable";
  if (!(effectivePowerW > 0)) warnings.push("O aparelho não tem potência cadastrada nem medição; não há base para simular.");

  const kW = effectivePowerW / 1000;
  const beforeKWh = kW * currentHours * days;
  const afterKWh = kW * proposedHours * days;
  const deltaHours = currentHours - proposedHours;
  const dailyKWh = kW * deltaHours;
  const monthlyKWh = beforeKWh - afterKWh;
  const scenarios: Scenario[] = [];

  if (measured) {
    assumptions.push(`Potência média de ${Math.round(measured)} W calculada a partir das medições deste mês.`);
    scenarios.push({ label: "central", factor: 1, kWh: monthlyKWh, cost: monthlyKWh * input.rate });
  } else if (input.cyclic) {
    assumptions.push(`Potência nominal cadastrada de ${input.power} W; aparelhos com compressor ou termostato não consomem a potência nominal o tempo todo.`);
    for (const [label, factor] of Object.entries(CYCLIC_FACTORS) as Array<[Scenario["label"], number]>) {
      scenarios.push({ label, factor, kWh: monthlyKWh * factor, cost: monthlyKWh * factor * input.rate });
    }
    warnings.push("Resultado em faixa: o ciclo real do compressor não é medido; a economia pode ficar perto do cenário conservador.");
  } else {
    assumptions.push(`Potência cadastrada de ${input.power} W, considerada constante enquanto ligado.`);
    scenarios.push({ label: "central", factor: 1, kWh: monthlyKWh, cost: monthlyKWh * input.rate });
  }
  assumptions.push(`${days} dia(s) de uso por mês, conforme o cadastro.`);
  assumptions.push(`Tarifa de R$ ${brlRate(input.rate)}/kWh, sem bandeiras ou impostos adicionais.`);

  const central = scenarios.find((item) => item.label === "central") ?? scenarios[0];
  const factor = central?.factor ?? 1;
  return {
    kind: "usage_reduction",
    source,
    applianceId: input.applianceId,
    applianceName: input.applianceName,
    power: input.power,
    effectivePowerW,
    currentHours,
    proposedHours,
    daysPerMonth: days,
    rate: input.rate,
    before: { kWh: beforeKWh * factor, cost: beforeKWh * factor * input.rate },
    after: { kWh: afterKWh * factor, cost: afterKWh * factor * input.rate },
    savings: {
      dailyKWh: dailyKWh * factor,
      dailyCost: dailyKWh * factor * input.rate,
      monthlyKWh: monthlyKWh * factor,
      monthlyCost: monthlyKWh * factor * input.rate,
      annualKWh: monthlyKWh * factor * 12,
      annualCost: monthlyKWh * factor * input.rate * 12,
      percent: beforeKWh > 0 ? monthlyKWh / beforeKWh : 0,
    },
    scenarios,
    assumptions,
    warnings,
  };
};

export const measuredAveragePower = (item: ApplianceFacts, daysElapsed: number) => {
  // Needs a week of readings and a declared usage to divide by.
  if (item.measuredKWh === null || item.measuredDays < 7 || !(item.usageHours > 0) || daysElapsed < 7) return null;
  const usedDays = Math.min(item.measuredDays, Math.round(item.days * (daysElapsed / 30)) || item.measuredDays);
  const watts = (item.measuredKWh * 1000) / (item.usageHours * Math.max(1, usedDays));
  return Number.isFinite(watts) && watts > 0 ? watts : null;
};

export const simulateForAppliance = (item: ApplianceFacts, proposedHours: number, daysElapsed: number) =>
  simulateUsage({
    power: item.power,
    currentHours: item.usageHours,
    proposedHours,
    daysPerMonth: item.days,
    rate: item.rate,
    cyclic: item.cyclic,
    measuredAveragePowerW: measuredAveragePower(item, daysElapsed),
    applianceId: item.id,
    applianceName: item.name,
  });

export interface ReplacementSimulation {
  kind: "replacement";
  source: EnergyDataSource;
  applianceId?: string;
  applianceName?: string;
  currentPowerW: number;
  newPowerW: number;
  monthlyKWh: number;
  monthlyCost: number;
  annualCost: number;
  paybackMonths: number | null;
  assumptions: string[];
}
export const simulateReplacement = (input: {
  currentPowerW: number; newPowerW: number; hours: number; daysPerMonth: number; rate: number;
  price?: number | null; applianceId?: string; applianceName?: string; cyclic?: boolean;
}): ReplacementSimulation => {
  const delta = Math.max(0, input.currentPowerW - input.newPowerW) / 1000;
  const monthlyKWh = delta * input.hours * input.daysPerMonth;
  const monthlyCost = monthlyKWh * input.rate;
  const assumptions = [
    `Mesmo uso de ${input.hours} h/dia em ${input.daysPerMonth} dia(s) por mês.`,
    `Tarifa de R$ ${brlRate(input.rate)}/kWh.`,
  ];
  if (input.cyclic) assumptions.push("Potência nominal dos dois modelos; com o ciclo do compressor a economia real tende a ser menor.");
  return {
    kind: "replacement",
    source: "simulated",
    applianceId: input.applianceId,
    applianceName: input.applianceName,
    currentPowerW: input.currentPowerW,
    newPowerW: input.newPowerW,
    monthlyKWh,
    monthlyCost,
    annualCost: monthlyCost * 12,
    paybackMonths: input.price && monthlyCost > 0 ? Math.ceil(input.price / monthlyCost) : null,
    assumptions,
  };
};

export interface BudgetPlan {
  kind: "budget";
  source: EnergyDataSource;
  target: number;
  current: number;
  gap: number;
  reachable: boolean;
  achieved: number;
  actions: Array<{ applianceId: string; applianceName: string; roomName: string | null; fromHours: number; toHours: number; monthlyCost: number }>;
  excluded: Array<{ applianceName: string; reason: string }>;
  assumptions: string[];
}

// Greedy plan: cut up to 30% (at least 1 h) of the most expensive appliances
// the user did not protect, never touching essential ones.
export interface BudgetOptions {
  protectedIds?: string[];
  // Largest share of an appliance's daily hours the plan may cut (0.1-0.5).
  maxReduction?: number;
  // Comfort floor: hours per day an appliance must keep.
  minHours?: Record<string, number>;
}
export const planBudget = (snapshot: PropertySnapshot, target: number, options: string[] | BudgetOptions = []): BudgetPlan => {
  const { protectedIds = [], maxReduction = 0.3, minHours = {} } = Array.isArray(options) ? { protectedIds: options } : options;
  const current = snapshot.totals.estimatedCost;
  const gap = Math.max(0, current - target);
  const actions: BudgetPlan["actions"] = [];
  const excluded: BudgetPlan["excluded"] = [];
  let achieved = 0;
  for (const item of snapshot.appliances) {
    if (achieved >= gap) break;
    if (protectedIds.includes(item.id)) { excluded.push({ applianceName: item.name, reason: "preservado por você" }); continue; }
    if (item.essential) { excluded.push({ applianceName: item.name, reason: "aparelho essencial ou de funcionamento contínuo" }); continue; }
    if (!(item.usageHours > 0) || !(item.power > 0) || item.estimatedCost <= 0) continue;
    const floor = Math.max(0, minHours[item.id] ?? 0);
    const cut = Math.min(item.usageHours - floor, Math.max(1, Math.round(item.usageHours * maxReduction * 2) / 2));
    if (cut <= 0) { excluded.push({ applianceName: item.name, reason: `mínimo de conforto de ${floor} h por dia` }); continue; }
    const sim = simulateForAppliance(item, item.usageHours - cut, snapshot.period.daysElapsed);
    const saving = sim.savings.monthlyCost;
    if (saving <= 0) continue;
    actions.push({
      applianceId: item.id, applianceName: item.name, roomName: item.roomName,
      fromHours: item.usageHours, toHours: item.usageHours - cut, monthlyCost: saving,
    });
    achieved += saving;
  }
  return {
    kind: "budget",
    source: "simulated",
    target,
    current,
    gap,
    reachable: achieved >= gap,
    achieved,
    actions,
    excluded,
    assumptions: [
      "Custo atual estimado pelas potências e horas cadastradas.",
      `Cada redução limita-se a ${Math.round(maxReduction * 100)}% do tempo de uso (mínimo de 1 h) para manter o plano realista.`,
      "Aparelhos essenciais, como geladeira e freezer, não entram no corte de horas.",
    ],
  };
};

// ---------------------------------------------------------------- recommendations

export type RecommendationKind =
  | "reduce_usage" | "review_power" | "enable_measurement" | "check_device" | "investigate_increase"
  | "set_goal" | "review_continuous" | "consider_replacement";
export interface Recommendation {
  id: string;
  kind: RecommendationKind;
  title: string;
  description: string;
  reason: string;
  propertyId: string;
  roomId: string | null;
  applianceId: string | null;
  evidence: string[];
  impactMonthly: number | null;
  impactSource: EnergyDataSource;
  effort: "baixo" | "medio" | "alto";
  confidence: "baixa" | "media" | "alta";
  nextStep: string;
  score: number;
}

export const buildRecommendations = (
  snapshot: PropertySnapshot,
  anomalies: Anomaly[],
  options: { hasGoal?: boolean; protectedIds?: string[]; minHours?: Record<string, number>; categories?: RecommendationKind[]; roomIds?: string[] } = {},
): Recommendation[] => {
  const list: Recommendation[] = [];
  const propertyId = snapshot.property.id;
  const total = snapshot.totals.estimatedCost;
  // Usage cuts: the three biggest costs, or every appliance of the rooms asked about.
  const candidates = options.roomIds?.length
    ? snapshot.appliances.filter((item) => item.roomId && options.roomIds!.includes(item.roomId))
    : snapshot.appliances.slice(0, 3);
  for (const item of candidates) {
    if (item.essential || options.protectedIds?.includes(item.id) || item.usageHours < 1.5 || item.estimatedCost <= 0) continue;
    if (item.usageHours - 1 < (options.minHours?.[item.id] ?? 0)) continue;
    const sim = simulateForAppliance(item, item.usageHours - 1, snapshot.period.daysElapsed);
    if (sim.savings.monthlyCost < 1) continue;
    list.push({
      id: `reduce_usage:${item.id}`,
      kind: "reduce_usage",
      title: `Usar ${item.name} 1 hora a menos por dia`,
      description: `De ${item.usageHours} h para ${item.usageHours - 1} h por dia.`,
      reason: `${item.name} representa ${Math.round(item.share * 100)}% do custo estimado do imóvel.`,
      propertyId, roomId: item.roomId, applianceId: item.id,
      evidence: [`${item.power} W × ${item.usageHours} h/dia × ${item.days} dias`, `Tarifa R$ ${brlRate(item.rate)}/kWh`],
      impactMonthly: sim.savings.monthlyCost,
      impactSource: "simulated",
      effort: "baixo",
      confidence: sim.scenarios.length > 1 ? "media" : "alta",
      nextStep: "Abrir o simulador e ajustar as horas.",
      score: sim.savings.monthlyCost,
    });
  }
  for (const item of snapshot.appliances) {
    if (!(item.power > 0)) {
      list.push({
        id: `review_power:${item.id}`, kind: "review_power",
        title: `Cadastrar a potência de ${item.name}`,
        description: "Sem potência não há como estimar o consumo nem simular economia.",
        reason: "Potência ausente ou zero no cadastro.",
        propertyId, roomId: item.roomId, applianceId: item.id, evidence: ["Potência: 0 W"],
        impactMonthly: null, impactSource: "unavailable", effort: "baixo", confidence: "alta",
        nextStep: "Editar o aparelho e informar a potência da etiqueta.", score: 5,
      });
    } else if (item.usageHours >= 20 && !item.cyclic && !item.essential) {
      list.push({
        id: `review_continuous:${item.id}`, kind: "review_continuous",
        title: `Conferir as horas de uso de ${item.name}`,
        description: `Cadastrado com ${item.usageHours} h por dia na potência máxima.`,
        reason: "Uso quase contínuo é incomum para este tipo de aparelho e pode superestimar a conta.",
        propertyId, roomId: item.roomId, applianceId: item.id,
        evidence: [`${item.usageHours} h/dia`, `${money(item.estimatedCost)} R$/mês estimados`],
        impactMonthly: null, impactSource: "estimated", effort: "baixo", confidence: "media",
        nextStep: "Revisar o cadastro do aparelho.", score: 4 + item.share * 10,
      });
    }
    if (item.cyclic && item.power >= 1000 && item.estimatedCost > 0 && !item.connected) {
      list.push({
        id: `enable_measurement:${item.id}`, kind: "enable_measurement",
        title: `Medir o consumo real de ${item.name}`,
        description: "Uma tomada ou aparelho com medição transforma a estimativa em dado real.",
        reason: "Aparelho de compressor com potência alta: a estimativa por potência nominal tem grande incerteza.",
        propertyId, roomId: item.roomId, applianceId: item.id,
        evidence: [`${item.power} W nominais`, "Sem dispositivo de medição vinculado"],
        impactMonthly: null, impactSource: "unavailable", effort: "medio", confidence: "media",
        nextStep: "Vincular um dispositivo SmartThings com medição de energia.", score: 3 + item.share * 5,
      });
    }
  }
  for (const anomaly of anomalies) {
    if (anomaly.kind === "measurement_gap") {
      list.push({
        id: `check_device:${anomaly.applianceId}`, kind: "check_device",
        title: anomaly.title, description: anomaly.detail,
        reason: "Sem leituras, a cobertura de medição do imóvel cai.",
        propertyId, roomId: snapshot.appliances.find((item) => item.id === anomaly.applianceId)?.roomId ?? null,
        applianceId: anomaly.applianceId ?? null, evidence: [anomaly.detail],
        impactMonthly: null, impactSource: "unavailable", effort: "baixo", confidence: "media",
        nextStep: "Verificar se o dispositivo está online no SmartThings.", score: 3,
      });
    } else if (anomaly.kind === "consumption_spike" || anomaly.kind === "baseline_increase") {
      list.push({
        id: `investigate_increase:${anomaly.id}`, kind: "investigate_increase",
        title: anomaly.title, description: anomaly.detail,
        reason: "Pode ser mudança de hábito, clima ou problema em um aparelho; os dados não indicam a causa.",
        propertyId, roomId: null, applianceId: null, evidence: [anomaly.detail],
        impactMonthly: null, impactSource: "measured", effort: "medio", confidence: "media",
        nextStep: "Comparar os aparelhos medidos nos últimos dias.", score: 6,
      });
    }
  }
  if (!options.hasGoal && total > 0) {
    list.push({
      id: `set_goal:${propertyId}`, kind: "set_goal",
      title: "Definir uma meta mensal de energia",
      description: "Com uma meta, o WattStatus monta um plano de economia e avisa quando a previsão passar dela.",
      reason: `Custo estimado atual: R$ ${brlRate(money(total))} por mês.`,
      propertyId, roomId: null, applianceId: null, evidence: [],
      impactMonthly: null, impactSource: "unavailable", effort: "baixo", confidence: "alta",
      nextStep: "Perguntar: \"Quero gastar no máximo R$ X por mês\".", score: 2,
    });
  }
  const seen = new Set<string>();
  return list
    .filter((item) => !options.categories?.length || options.categories.includes(item.kind))
    .filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)))
    .sort((a, b) => b.score - a.score);
};

// ---------------------------------------------------------------- tracking

// Compares measured daily averages before and after a recommendation was
// applied. It reports what changed, never that the action caused it.
export const evaluateApplied = (
  appliedAt: Date,
  daily: DailyPoint[],
  expectedMonthlyKWh: number | null,
) => {
  const at = appliedAt.toISOString().slice(0, 10);
  const before = daily.filter((point) => point.day < at).slice(-14);
  const after = daily.filter((point) => point.day > at).slice(0, 14);
  if (before.length < 7 || after.length < 7) {
    return {
      status: "insufficient_data" as const,
      beforePerDay: null, afterPerDay: null, change: null,
      limitations: ["São necessários pelo menos 7 dias medidos antes e depois da aplicação."],
    };
  }
  const beforePerDay = mean(before.map((point) => point.kWh));
  const afterPerDay = mean(after.map((point) => point.kWh));
  return {
    status: "ok" as const,
    beforePerDay, afterPerDay,
    change: beforePerDay > 0 ? (afterPerDay - beforePerDay) / beforePerDay : null,
    expectedPerDay: expectedMonthlyKWh !== null ? expectedMonthlyKWh / 30 : null,
    limitations: [
      "A comparação não isola clima, ocupação ou mudanças em outros aparelhos.",
      "Variação observada não prova que a ação foi a causa.",
    ],
  };
};

// ---------------------------------------------------------------- charts

export interface TrendPoint { month: string; estimatedKWh: number; estimatedCost: number; measuredKWh: number | null }
export interface ChartExplanation {
  status: "ok" | "insufficient_data";
  points: TrendPoint[];
  facts: Array<{ kind: string; text: string; month?: string; applianceId?: string; roomId?: string }>;
  limitations: string[];
}

const monthLabel = (year: number, month: number) =>
  new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" });

// Same series as the dashboard trend chart: per month, the estimate of the
// appliances that existed by then, and the measured total when there is one.
export const buildTrend = (
  appliances: ApplianceRecord[],
  measuredByMonth: Map<string, number>,
  year: number,
  month: number,
  property?: PropertyRecord | null,
): TrendPoint[] =>
  Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 6 + index, 1));
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth() + 1;
    const end = new Date(Date.UTC(y, m, 1));
    const days = daysInMonth(y, m);
    let kWhTotal = 0, cost = 0;
    for (const appliance of appliances) {
      const created = new Date(appliance.createdAt);
      if (!(created < end)) continue;
      const estimate = estimateMonthly(appliance, days);
      kWhTotal += estimate.consumption;
      cost += estimate.consumption * applianceRate(appliance, property).rate;
    }
    const key = `${y}-${String(m).padStart(2, "0")}`;
    return { month: monthLabel(y, m), estimatedKWh: kWhTotal, estimatedCost: cost, measuredKWh: measuredByMonth.get(key) ?? null };
  });

// Verifiable facts about the trend and the selected month, for "Explicar
// este gráfico". Every sentence is built from the series itself.
export const explainTrend = (points: TrendPoint[], snapshot: PropertySnapshot | null): ChartExplanation => {
  const facts: ChartExplanation["facts"] = [];
  const limitations: string[] = [];
  const withData = points.filter((point) => point.estimatedKWh > 0 || (point.measuredKWh ?? 0) > 0);
  if (!withData.length) {
    return { status: "insufficient_data", points, facts, limitations: ["Não há aparelhos nem medições nos meses do gráfico."] };
  }
  const last = points[points.length - 1];
  const previous = points[points.length - 2];
  if (previous && previous.estimatedKWh > 0) {
    const change = (last.estimatedKWh - previous.estimatedKWh) / previous.estimatedKWh;
    facts.push({
      kind: "estimate_change",
      text: Math.abs(change) < 0.01
        ? `A estimativa de ${last.month} (${kwh(last.estimatedKWh)} kWh) é praticamente igual à de ${previous.month}: o cadastro não mudou.`
        : `A estimativa foi de ${kwh(previous.estimatedKWh)} kWh em ${previous.month} para ${kwh(last.estimatedKWh)} kWh em ${last.month} (${change > 0 ? "+" : ""}${Math.round(change * 100)}%), por aparelhos cadastrados ou dias do mês.`,
      month: last.month,
    });
  }
  let biggest: { from: TrendPoint; to: TrendPoint; delta: number } | null = null;
  for (let i = 1; i < points.length; i++) {
    const delta = points[i].estimatedKWh - points[i - 1].estimatedKWh;
    if (!biggest || Math.abs(delta) > Math.abs(biggest.delta)) biggest = { from: points[i - 1], to: points[i], delta };
  }
  if (biggest && Math.abs(biggest.delta) >= 1) {
    facts.push({
      kind: "biggest_change",
      text: `A maior mudança da série foi de ${biggest.from.month} para ${biggest.to.month}: ${biggest.delta > 0 ? "+" : ""}${kwh(biggest.delta)} kWh na estimativa.`,
      month: biggest.to.month,
    });
  }
  const measured = points.filter((point) => point.measuredKWh !== null);
  if (measured.length >= 2) {
    const a = measured[measured.length - 2];
    const b = measured[measured.length - 1];
    facts.push({ kind: "measured_change", text: `Medido: ${kwh(a.measuredKWh!)} kWh em ${a.month} e ${kwh(b.measuredKWh!)} kWh em ${b.month}. Meses incompletos ou com aparelhos sem leitura não são comparáveis diretamente.`, month: b.month });
  } else if (measured.length === 1) {
    limitations.push("Só um mês tem medição; não há como comparar o medido entre meses.");
  } else {
    limitations.push("A série é só estimada: ela muda quando o cadastro muda, não quando o uso real muda.");
  }
  if (snapshot) {
    const top = snapshot.appliances[0];
    if (top && top.estimatedCost > 0) facts.push({ kind: "top_appliance", text: `${top.name} é o maior peso do mês: ${Math.round(top.share * 100)}% do custo estimado.`, applianceId: top.id, roomId: top.roomId ?? undefined });
    for (const anomaly of detectAnomalies(snapshot).filter((item) => item.kind !== "measurement_gap").slice(0, 2)) {
      facts.push({ kind: "anomaly", text: anomaly.detail, applianceId: anomaly.applianceId });
    }
  }
  return { status: "ok", points, facts, limitations };
};

// ---------------------------------------------------------------- reports

// Deterministic summary for the monthly report and its PDF. No model involved.
export const buildReportSummary = (snapshot: PropertySnapshot, recommendations: Recommendation[]) => {
  const lines: string[] = [];
  const { totals } = snapshot;
  if (!totals.applianceCount) return { lines: ["Nenhum aparelho cadastrado neste imóvel."], quality: "sem dados" };
  const top = snapshot.appliances.slice(0, 3).filter((item) => item.estimatedCost > 0);
  if (top.length) lines.push(`Maior impacto: ${top.map((item) => `${item.name} (${Math.round(item.share * 100)}%)`).join(", ")}.`);
  const comparison = comparePeriods(snapshot);
  if (comparison.status === "ok" && comparison.change !== null) {
    lines.push(`Média diária medida ${Math.abs(comparison.change) < 0.05 ? "estável em relação ao" : `${Math.round(Math.abs(comparison.change) * 100)}% ${comparison.change > 0 ? "acima" : "abaixo"} do`} mês anterior (${kwh(comparison.currentPerDay!)} contra ${kwh(comparison.previousPerDay!)} kWh/dia).`);
  } else {
    lines.push("Sem medições suficientes para comparar com o mês anterior.");
  }
  const source = measuredSource(snapshot);
  const quality = source === "measured" ? "medição completa" : source === "measured_partial" ? "medição parcial" : "somente estimativa";
  lines.push(source === "unavailable"
    ? "Qualidade dos dados: somente estimativa pelo cadastro."
    : `Qualidade dos dados: ${totals.measuredApplianceCount} de ${totals.applianceCount} aparelhos medidos, cerca de ${Math.round(totals.coverage * 100)}% do consumo estimado.`);
  for (const item of recommendations.filter((rec) => rec.impactMonthly).slice(0, 2)) {
    lines.push(`Recomendação: ${item.title} (economia simulada de R$ ${brlRate(item.impactMonthly!)} por mês).`);
  }
  return { lines, quality };
};

// ---------------------------------------------------------------- alerts

export type AlertKind = "consumption_increase" | "goal_risk" | "forecast" | "missing_reading" | "persistent_anomaly";
export interface AlertCandidate { key: string; kind: AlertKind; title: string; detail: string; propertyId: string; applianceId?: string }

// Deterministic alert candidates; dedupe and frequency are applied by the store.
export const evaluateAlerts = (
  snapshot: PropertySnapshot,
  preferences: { monthlyGoal?: number | null; monthlyKWhGoal?: number | null },
  now = new Date(),
): AlertCandidate[] => {
  const out: AlertCandidate[] = [];
  const pid = snapshot.property.id;
  const month = snapshot.period.start.slice(0, 7);
  const forecast = forecastMonth(snapshot);
  if (forecast.status === "ok" && forecast.cost !== null && preferences.monthlyGoal && forecast.cost >= preferences.monthlyGoal * 0.9) {
    out.push({
      key: `goal_risk:${pid}:${month}`, kind: "goal_risk", propertyId: pid,
      title: forecast.cost > preferences.monthlyGoal ? "Previsão acima da meta" : "Previsão perto da meta",
      detail: `Previsão de cerca de R$ ${Math.round(forecast.cost)} para uma meta de R$ ${Math.round(preferences.monthlyGoal)} (${forecast.source === "projected" ? "pelo ritmo medido" : "pelo cadastro"}).`,
    });
  }
  if (forecast.status === "ok" && forecast.kWh !== null && preferences.monthlyKWhGoal && forecast.kWh >= preferences.monthlyKWhGoal * 0.9) {
    out.push({
      key: `kwh_goal_risk:${pid}:${month}`, kind: "goal_risk", propertyId: pid, title: "Consumo previsto perto da meta",
      detail: `Previsão de ${kwh(forecast.kWh)} kWh para uma meta de ${kwh(preferences.monthlyKWhGoal)} kWh.`,
    });
  }
  if (forecast.source === "projected" && forecast.cost !== null && snapshot.totals.previousMeasuredCost > 0 && forecast.cost > snapshot.totals.previousMeasuredCost * 1.15) {
    out.push({
      key: `forecast:${pid}:${month}`, kind: "forecast", propertyId: pid, title: "Mês deve fechar acima do anterior",
      detail: `Projeção de R$ ${Math.round(forecast.cost)} contra R$ ${Math.round(snapshot.totals.previousMeasuredCost)} medidos no mês anterior.`,
    });
  }
  const comparison = comparePeriods(snapshot);
  if (comparison.status === "ok" && comparison.change !== null && comparison.change >= 0.2) {
    out.push({
      key: `increase:${pid}:${month}`, kind: "consumption_increase", propertyId: pid, title: "Aumento incomum do consumo medido",
      detail: `Média diária ${Math.round(comparison.change * 100)}% acima do mês anterior.`,
    });
  }
  for (const anomaly of detectAnomalies(snapshot, now)) {
    if (anomaly.kind === "measurement_gap") {
      out.push({ key: `missing:${anomaly.applianceId}:${month}`, kind: "missing_reading", propertyId: pid, applianceId: anomaly.applianceId, title: anomaly.title, detail: anomaly.detail });
    }
    if (anomaly.kind === "baseline_increase") {
      out.push({ key: `persistent:${pid}:${month}`, kind: "persistent_anomaly", propertyId: pid, title: anomaly.title, detail: anomaly.detail });
    }
  }
  return out;
};
