import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  month: number;
  year: number;
  years: number[];
  periodLabel: string;
  scopeLabel?: string;
  isCurrentMonth: boolean;
  refreshing: boolean;
  onChange: (year: number, month: number) => void;
  onReset: () => void;
  onRefresh: () => void;
}

const selectClass =
  "h-10 rounded-lg border border-input bg-background px-3 text-sm font-medium capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
};

export function SummaryHeader({
  month,
  year,
  years,
  periodLabel,
  scopeLabel,
  isCurrentMonth,
  refreshing,
  onChange,
  onReset,
  onRefresh,
}: Props) {
  const shift = (delta: number) => {
    const date = new Date(year, month - 1 + delta, 1);
    onChange(date.getFullYear(), date.getMonth() + 1);
  };
  const atFirstPeriod = year === Math.min(...years) && month === 1;
  const atLastPeriod = year === Math.max(...years) && month === 12;
  return (
    <section
      aria-labelledby="summary-title"
      className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-muted-foreground">
          {greeting()} · analisando{" "}
          <span className="text-foreground">{periodLabel}</span>
          {scopeLabel && (
            <>
              {" "}
              · <span className="font-semibold text-foreground">{scopeLabel}</span>
            </>
          )}
        </p>
        <h1
          id="summary-title"
          className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl"
        >
          Sua energia em resumo
        </h1>
        <p className="mt-2 max-w-xl text-muted-foreground">
          Estimativas, medições e custos do período em um só lugar — sempre
          indicando a origem de cada número.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
        <div
          role="group"
          aria-label="Período analisado"
          className="flex items-center gap-1 rounded-xl border bg-card p-1 shadow-sm"
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0"
            aria-label="Mês anterior"
            disabled={atFirstPeriod}
            onClick={() => shift(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <label htmlFor="dashboard-month" className="sr-only">
            Mês
          </label>
          <select
            id="dashboard-month"
            className={cn(selectClass, "min-w-0 flex-1 border-0 bg-transparent")}
            value={month}
            onChange={(event) => onChange(year, Number(event.target.value))}
          >
            {Array.from({ length: 12 }, (_, index) => (
              <option key={index} value={index + 1}>
                {new Date(2000, index, 1).toLocaleDateString("pt-BR", {
                  month: "long",
                })}
              </option>
            ))}
          </select>
          <label htmlFor="dashboard-year" className="sr-only">
            Ano
          </label>
          <select
            id="dashboard-year"
            className={cn(selectClass, "border-0 bg-transparent")}
            value={year}
            onChange={(event) => onChange(Number(event.target.value), month)}
          >
            {years.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0"
            aria-label="Próximo mês"
            disabled={atLastPeriod}
            onClick={() => shift(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex gap-2">
          {!isCurrentMonth && (
            <Button variant="outline" className="h-11 flex-1 sm:flex-none" onClick={onReset}>
              Mês atual
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11 shrink-0"
            aria-label="Atualizar dados"
            title="Atualizar dados"
            onClick={onRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </Button>
          <Button asChild className="h-11 flex-1 sm:flex-none">
            <Link to="/aparelhos?adicionar=1">
              <Plus className="mr-2 h-4 w-4" />
              Adicionar aparelho
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
