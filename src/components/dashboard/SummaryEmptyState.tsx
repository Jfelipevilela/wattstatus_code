import { Link } from "react-router-dom";
import { BarChart3, PlugZap, Plus, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

const steps = [
  {
    icon: Plus,
    title: "Cadastre um aparelho",
    body: "Potência e horas de uso bastam para a primeira estimativa.",
  },
  {
    icon: PlugZap,
    title: "Conecte um medidor",
    body: "Com SmartThings, leituras reais aparecem ao lado da estimativa.",
  },
  {
    icon: BarChart3,
    title: "Acompanhe o mês",
    body: "Custos, ranking e tendências se atualizam sozinhos.",
  },
];

export function SummaryEmptyState() {
  return (
    <section
      aria-labelledby="empty-title"
      className="relative overflow-hidden rounded-3xl border bg-card p-6 shadow-sm sm:p-10"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-energy-green-light/15 blur-3xl"
      />
      <div className="relative max-w-2xl">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:text-energy-400">
          <Zap className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 id="empty-title" className="mt-5 text-2xl font-bold tracking-tight">
          Seu resumo começa no primeiro aparelho
        </h2>
        <p className="mt-2 text-muted-foreground">
          Ainda não há dados para resumir. Em dois minutos você vê quanto sua
          casa consome e quanto isso custa.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button asChild className="h-11">
            <Link to="/aparelhos?adicionar=1">Cadastrar primeiro aparelho</Link>
          </Button>
          <Button asChild variant="outline" className="h-11">
            <Link to="/apps">Conectar integração</Link>
          </Button>
        </div>
      </div>
      <ol className="relative mt-8 grid gap-4 sm:grid-cols-3">
        {steps.map(({ icon: Icon, title, body }, index) => (
          <li key={title} className="rounded-2xl border bg-background/60 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="text-muted-foreground tabular-nums">0{index + 1}</span>
              <Icon className="h-4 w-4 text-primary dark:text-energy-400" aria-hidden="true" />
              {title}
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
