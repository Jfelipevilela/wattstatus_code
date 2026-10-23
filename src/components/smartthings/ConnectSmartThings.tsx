import { useState } from "react";
import { Eye, EyeOff, ExternalLink, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { SiSmartthings } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notifyError } from "@/lib/error-toast";

const TOKENS_URL = "https://account.smartthings.com/tokens";
const SCOPES = ["Dispositivos: listar", "Dispositivos: ver", "Dispositivos: controlar", "Locais: ver"];

interface Props {
  oauthAvailable?: boolean;
  redirecting?: boolean;
  onOAuth?: () => void;
  saving: boolean;
  onSave: (token: string) => Promise<void>;
  reason?: string;
  compact?: boolean;
}

export function ConnectSmartThings({
  oauthAvailable,
  redirecting,
  onOAuth,
  saving,
  onSave,
  reason,
  compact,
}: Props) {
  const [value, setValue] = useState("");
  const [visible, setVisible] = useState(false);
  const useOAuth = Boolean(oauthAvailable && onOAuth);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!value.trim()) {
      notifyError("Cole o token SmartThings para continuar.", { title: "Token obrigatório" });
      return;
    }
    try {
      await onSave(value.trim());
      setValue("");
    } catch {
      // The hook already shows the error toast.
    }
  };

  const form = (
    <form onSubmit={submit} className="space-y-3">
      <Label htmlFor="smartthings-token">Token de acesso pessoal</Label>
      <div className="relative">
        <Input
          id="smartthings-token"
          type={visible ? "text" : "password"}
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Cole aqui o token gerado"
          className="h-11 pr-11 font-mono"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Ocultar token" : "Mostrar token"}
          className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <Button type="submit" disabled={saving} variant={useOAuth ? "outline" : "default"} className="h-11 w-full">
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
        {saving ? "Validando token…" : "Conectar com token"}
      </Button>
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Validamos o token com a SmartThings antes de salvar. Ele fica criptografado no servidor. Tokens
        pessoais novos expiram em 24 horas.{" "}
        <a href={TOKENS_URL} target="_blank" rel="noreferrer" className="underline underline-offset-4">
          Gerar token
        </a>
      </p>
    </form>
  );

  const samsungButton = useOAuth && (
    <Button type="button" onClick={onOAuth} disabled={redirecting} className="h-12 w-full text-base">
      {redirecting ? (
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
      ) : (
        <SiSmartthings className="mr-2 h-5 w-5" aria-hidden="true" />
      )}
      {redirecting ? "Abrindo login Samsung…" : "Entrar com conta Samsung"}
    </Button>
  );

  const tokenSection = useOAuth ? (
    <details className="group rounded-xl border p-4">
      <summary className="cursor-pointer list-none text-sm text-muted-foreground group-open:mb-4">
        Prefere usar um token pessoal? <span className="font-medium underline underline-offset-4">Avançado</span>
      </summary>
      {form}
    </details>
  ) : (
    form
  );

  if (compact)
    return (
      <section className="rounded-2xl border border-energy-yellow/40 bg-energy-yellow/5 p-5">
        <h2 className="font-semibold">Reconecte o SmartThings</h2>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">
          {reason ?? "O acesso atual foi recusado."}{" "}
          {useOAuth ? "Entre de novo com sua conta Samsung para continuar." : "Gere um novo token e cole abaixo."}
        </p>
        <div className="max-w-md space-y-3">
          {samsungButton}
          {tokenSection}
        </div>
      </section>
    );

  const steps = useOAuth
    ? [
        ["Entre com sua conta Samsung", "Na página oficial da Samsung, com seu login de sempre."],
        ["Autorize o WattStatus", SCOPES.join(" · ")],
        ["Pronto", "Voltamos para cá e listamos seus dispositivos."],
      ]
    : [
        ["Abra a página de tokens", "Entre com sua conta Samsung e clique em Gerar novo token."],
        ["Marque as permissões", SCOPES.join(" · ")],
        ["Cole o token aqui", "Validamos na hora e listamos seus dispositivos."],
      ];

  return (
    <section
      aria-labelledby="connect-title"
      className="grid overflow-hidden rounded-3xl border bg-card shadow-sm lg:grid-cols-[1.2fr_1fr]"
    >
      <div className="relative overflow-hidden bg-gradient-to-br from-zinc-900 to-zinc-950 p-6 text-white sm:p-10">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-sky-500/20 blur-3xl" />
        <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
          <SiSmartthings className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 id="connect-title" className="relative mt-5 text-3xl font-bold tracking-tight">
          Conecte sua casa ao WattStatus
        </h1>
        <p className="relative mt-2 max-w-md text-white/70">
          Controle aparelhos SmartThings e veja potência e consumo reais ao lado das suas estimativas.
        </p>
        <ol className="relative mt-8 space-y-4">
          {steps.map(([title, body], index) => (
            <li key={title} className="flex gap-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold tabular-nums">
                {index + 1}
              </span>
              <span>
                <span className="block font-medium">{title}</span>
                <span className="block text-sm text-white/60">{body}</span>
              </span>
            </li>
          ))}
        </ol>
        {!useOAuth && (
          <Button asChild variant="secondary" className="relative mt-8 h-11">
            <a href={TOKENS_URL} target="_blank" rel="noreferrer">
              Abrir página de tokens <ExternalLink className="ml-2 h-4 w-4" />
            </a>
          </Button>
        )}
      </div>
      <div className="flex flex-col justify-center gap-4 p-6 sm:p-10">
        {useOAuth && (
          <div>
            <h2 className="text-lg font-semibold">Conecte em um clique</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Você entra na Samsung, autoriza o WattStatus e volta para cá. O acesso se renova sozinho.
            </p>
          </div>
        )}
        {samsungButton}
        {tokenSection}
        <p className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
          {useOAuth
            ? "Você pode revogar o acesso quando quiser pelo app SmartThings ou pelo botão Desconectar."
            : "Pela regra atual da Samsung, tokens pessoais novos expiram em 24 horas. Quando expirar, esta tela pede um novo; seus aparelhos importados e o histórico continuam salvos."}
        </p>
      </div>
    </section>
  );
}
