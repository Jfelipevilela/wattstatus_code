import { Link } from "react-router-dom";
import { Activity, Gauge, Power, ShieldCheck, Smartphone, QrCode, PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const APPS = [
  {
    name: "Smart Life",
    appStore: "https://apps.apple.com/app/smart-life-smart-living/id1115101477",
    googlePlay: "https://play.google.com/store/apps/details?id=com.tuya.smartlife",
  },
  {
    name: "Tuya Smart",
    appStore: "https://apps.apple.com/app/tuya-smart/id1034649547",
    googlePlay: "https://play.google.com/store/apps/details?id=com.tuya.smart",
  },
];

interface Props {
  // The server has Tuya keys; linking an account is possible.
  projectConfigured: boolean;
  compact?: boolean;
}

// The first screen a user sees before their Smart Life account is linked.
// The steps describe the real test-phase flow: the link is made on the server,
// so the page never asks for a Tuya password or account id.
export function ConnectTuya({ projectConfigured, compact }: Props) {
  const steps: Array<{ icon: typeof Smartphone; title: string; body: string }> = [
    {
      icon: Smartphone,
      title: "Cadastre seus dispositivos",
      body:
        "Instale o app Smart Life ou Tuya Smart e adicione os dispositivos compatíveis. " +
        "Algumas marcas usam a plataforma Tuya. Confira se o seu modelo pode ser cadastrado em um desses apps.",
    },
    {
      icon: QrCode,
      title: "Vincule a conta ao WattStatus",
      body:
        "Na fase de testes, o vínculo é feito pela equipe do WattStatus: você lê um QR code com o Smart Life ou Tuya Smart e informa o código da conta. " +
        "Nenhuma senha Tuya é digitada aqui.",
    },
    {
      icon: PlugZap,
      title: "Acompanhe seus dispositivos aqui",
      body:
        "Depois do vínculo, os dispositivos aparecem nesta página. Veja o estado ligado/desligado quando disponível, leia potência e consumo quando houver medição e ligue ou desligue aparelhos com chave (switch). Você também pode importar aparelhos para seu imóvel.",
    },
  ];

  const reads = [
    { icon: Power, label: "Ligado ou desligado" },
    { icon: Gauge, label: "Potência agora, em watts" },
    { icon: Activity, label: "Consumo acumulado, em kWh" },
  ];

  return (
    <section
      aria-labelledby="tuya-connect-title"
      className={cn(
        "grid overflow-hidden rounded-3xl border bg-card shadow-sm",
        compact ? "" : "lg:grid-cols-[1.2fr_1fr]",
      )}
    >
      <div className="p-6 sm:p-8">
        <p className="text-sm font-medium text-muted-foreground">Tuya / Smart Life</p>
        <h1 id="tuya-connect-title" className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
          Dispositivos Tuya de qualquer marca
        </h1>
        <p className="mt-3 max-w-prose text-muted-foreground">
          A plataforma Tuya reúne tomadas e réguas, interruptores, disjuntores e medidores de energia, lâmpadas e fitas
          de LED, ar-condicionado e controles IR, ventiladores, aquecedores, chuveiros e boilers, cortinas e
          persianas e sensores de porta, presença e temperatura. O suporte no WattStatus depende dos recursos
          que cada dispositivo disponibiliza na integração.
        </p>

        {!projectConfigured && (
          <p role="status" className="mt-5 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
            A integração Tuya ainda não está habilitada neste servidor. Os passos abaixo valem assim que ela for
            ativada.
          </p>
        )}

        <ol className="mt-6 space-y-5">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary dark:text-energy-400"
              >
                <step.icon className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-semibold">
                  <span className="sr-only">Passo {index + 1}: </span>
                  {step.title}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-8 flex flex-col gap-4">
          {APPS.map((app) => (
            <div key={app.name} role="group" aria-label={`Baixar ${app.name}`}>
              <h2 className="mb-2 text-sm font-semibold">{app.name}</h2>
              <div className="flex flex-wrap gap-3">
                <Button asChild variant="outline" className="h-11">
                  <a href={app.appStore} target="_blank" rel="noopener noreferrer">
                    Baixar na App Store<span className="sr-only">: {app.name}</span>
                  </a>
                </Button>
                <Button asChild variant="outline" className="h-11">
                  <a href={app.googlePlay} target="_blank" rel="noopener noreferrer">
                    Baixar no Google Play<span className="sr-only">: {app.name}</span>
                  </a>
                </Button>
              </div>
            </div>
          ))}
          <Button asChild variant="outline" className="h-11 self-start">
            <Link to="/apps">Voltar às integrações</Link>
          </Button>
        </div>
      </div>

      <aside className="border-t bg-muted/40 p-6 sm:p-8 lg:border-l lg:border-t-0">
        <h2 className="font-semibold">O que o WattStatus lê</h2>
        <ul className="mt-4 space-y-3">
          {reads.map((item) => (
            <li key={item.label} className="flex items-center gap-3 text-sm">
              <item.icon className="h-4 w-4 text-energy-green-light" aria-hidden="true" />
              {item.label}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          Potência e consumo só aparecem quando o dispositivo fornece essas medições. O controle liga/desliga
          exige uma chave (switch). Cor, temperatura, modo e outros recursos ainda não são controlados aqui.
        </p>
        <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          As chaves do projeto e o vínculo da conta ficam no servidor. Esta página nunca pede sua senha Tuya.
        </p>
      </aside>
    </section>
  );
}
