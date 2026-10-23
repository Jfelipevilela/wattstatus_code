import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Check, Loader2, X } from "lucide-react";
import { SiSmartthings } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

type Phase = "exchanging" | "done" | "failed";

const steps = ["Conta Samsung autorizada", "Gerando acesso seguro", "Buscando seus dispositivos"];

export default function SmartThingsCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [phase, setPhase] = useState<Phase>("exchanging");
  const [step, setStep] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || (!token && !user)) return;
    started.current = true;
    const code = params.get("code");
    const state = params.get("state");
    const denied = params.get("error");
    // Drop the one-time code from the address bar and history.
    window.history.replaceState(null, "", window.location.pathname);
    if (denied || !code || !state) {
      setPhase("failed");
      setMessage(
        denied === "access_denied"
          ? "Você cancelou a autorização na Samsung."
          : "A Samsung não devolveu uma autorização válida.",
      );
      return;
    }
    setStep(1);
    apiRequest(
      "/api/integrations/smartthings/oauth/callback",
      { method: "POST", body: JSON.stringify({ code, state }), skipErrorToast: true },
      token || undefined,
    )
      .then(() => {
        setStep(2);
        setPhase("done");
        toast({ title: "SmartThings conectado", description: "Sua conta Samsung está vinculada." });
        setTimeout(() => navigate("/integracoes/smartthings", { replace: true }), 1200);
      })
      .catch((err) => {
        setPhase("failed");
        setMessage(err instanceof Error ? err.message : "Não foi possível concluir a conexão.");
      });
  }, [params, token, user, navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <section
        aria-live="polite"
        className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-b from-zinc-900 to-zinc-950 p-8 text-white shadow-2xl"
      >
        <div aria-hidden="true" className="pointer-events-none absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="relative flex items-center justify-center gap-3">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
            <SiSmartthings className="h-7 w-7" aria-hidden="true" />
          </span>
          <span className="h-px w-10 bg-gradient-to-r from-white/10 via-white/50 to-white/10" />
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-energy-green-light/15 text-xl font-bold text-energy-green-light">
            W
          </span>
        </div>
        <h1 className="relative mt-6 text-center text-2xl font-bold tracking-tight">
          {phase === "failed" ? "Conexão não concluída" : phase === "done" ? "Tudo pronto!" : "Conectando sua conta"}
        </h1>
        {phase === "failed" ? (
          <div className="relative mt-4 space-y-6 text-center">
            <p className="text-white/70">{message}</p>
            <Button asChild className="h-11 w-full">
              <Link to="/integracoes/smartthings">Tentar novamente</Link>
            </Button>
          </div>
        ) : (
          <ol className="relative mt-6 space-y-3">
            {steps.map((text, index) => {
              const done = index < step || phase === "done";
              const active = index === step && phase !== "done";
              return (
                <li key={text} className="flex items-center gap-3 text-sm">
                  <span
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full border transition-colors",
                      done
                        ? "border-energy-green-light/40 bg-energy-green-light text-zinc-950"
                        : "border-white/15 bg-white/5 text-white/50",
                    )}
                  >
                    {done ? (
                      <Check className="h-4 w-4" />
                    ) : active ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <span className="text-xs">{index + 1}</span>
                    )}
                  </span>
                  <span className={done || active ? "text-white" : "text-white/50"}>{text}</span>
                </li>
              );
            })}
          </ol>
        )}
        {phase === "failed" && (
          <X aria-hidden="true" className="absolute right-6 top-6 h-5 w-5 text-white/30" />
        )}
      </section>
    </main>
  );
}
