import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocation } from "react-router-dom";
import { ArrowUp, Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import { useProperties } from "@/hooks/useProperties";
import { cn } from "@/lib/utils";
import { aiErrorMessage, wattAI, type WattAIContext, type WattAIResponse } from "@/lib/wattai";
import { useWattAI } from "./WattAI";
import { WattAIMessageBody } from "./WattAICards";

interface Message { id: string; role: "user" | "assistant"; content: string; response?: WattAIResponse; error?: boolean }

const SUGGESTIONS = [
  "Analisar minha casa",
  "Onde posso economizar?",
  "Prever a conta deste mês",
  "Comparar ambientes",
  "Qual aparelho mais gasta?",
  "Investigar uma alteração no consumo",
];
const MAX_STORED = 30;

const storageKey = (userId: string) => `wattai:conversation:${userId}`;
const readStored = (userId: string): { messages: Message[]; context: WattAIContext } => {
  try {
    const raw = sessionStorage.getItem(storageKey(userId));
    if (raw) return JSON.parse(raw);
  } catch { /* storage unavailable */ }
  return { messages: [], context: {} };
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: { message?: string; context?: WattAIContext; nonce: number } | null;
  userId: string;
}

export default function WattAIPanel({ open, onOpenChange, request, userId }: Props) {
  const { runAction } = useWattAI();
  const location = useLocation();
  const { properties } = useProperties();
  const initial = useMemo(() => readStored(userId), [userId]);
  const [messages, setMessages] = useState<Message[]>(initial.messages);
  const [context, setContext] = useState<WattAIContext>(initial.context);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const handled = useRef<number | null>(null);

  // The page's property is the default context.
  const routeProperty = location.pathname.match(/^\/imoveis\/([^/]+)/)?.[1];
  useEffect(() => {
    if (routeProperty && routeProperty !== context.propertyId) setContext({ propertyId: routeProperty });
  }, [routeProperty]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try { sessionStorage.setItem(storageKey(userId), JSON.stringify({ messages: messages.slice(-MAX_STORED), context })); }
    catch { /* storage unavailable */ }
  }, [messages, context, userId]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => () => abort.current?.abort(), []);

  const send = async (text: string, extra?: WattAIContext) => {
    const message = text.trim().slice(0, 600);
    if (!message || busy) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const nextContext = { ...context, ...extra };
    const history = messages.slice(-6).map((item) => ({ role: item.role, content: item.content.slice(0, 1200) }));
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: message }]);
    setInput("");
    setBusy(true);
    try {
      const response = await wattAI.chat({ message, context: nextContext, history }, controller.signal);
      setContext(response.context);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: response.message, response }]);
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return;
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: aiErrorMessage(error), error: true }]);
    } finally {
      if (abort.current === controller) setBusy(false);
    }
  };

  // Requests from other pages ("Analisar este ambiente", "Explicar este gráfico").
  useEffect(() => {
    if (!request || handled.current === request.nonce) return;
    handled.current = request.nonce;
    if (request.context) setContext((current) => ({ ...current, ...request.context }));
    if (request.message) void send(request.message, request.context);
  }, [request]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send(input);
  };
  const reset = () => {
    abort.current?.abort();
    setBusy(false);
    setMessages([]);
    setContext(routeProperty ? { propertyId: routeProperty } : {});
  };

  const activeProperty = properties.find((item) => item.id === context.propertyId) ?? properties.find((item) => item.isPrimary) ?? properties[0];

  return (
    <aside
      aria-label="WattStatus AI"
      aria-hidden={!open}
      // Escape closes the panel only when focus is inside it, so closing the
      // simulator dialog never closes the conversation too.
      onKeyDown={(event) => event.key === "Escape" && onOpenChange(false)}
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 flex h-[85dvh] flex-col border-t bg-background shadow-2xl transition-transform duration-200 motion-reduce:transition-none",
        "sm:inset-x-auto sm:right-4 sm:bottom-4 sm:h-[min(720px,calc(100dvh-2rem))] sm:w-[420px] sm:rounded-xl sm:border",
        open ? "translate-y-0" : "pointer-events-none translate-y-[110%]",
      )}
    >
      <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden /> WattStatus AI
          </p>
          <p className="text-xs text-muted-foreground">Inteligência para consumir melhor.</p>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button type="button" onClick={reset} className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Nova conversa" title="Nova conversa">
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
          <button type="button" onClick={() => onOpenChange(false)} className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {properties.length > 0 && (
        <div className="flex items-center gap-2 border-b px-4 py-2 text-xs">
          <span className="text-muted-foreground">Imóvel</span>
          <select
            value={activeProperty?.id ?? ""}
            onChange={(event) => setContext({ propertyId: event.target.value })}
            className="min-w-0 flex-1 truncate rounded-md border bg-background px-2 py-1 text-xs"
            aria-label="Imóvel analisado"
          >
            {properties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>
      )}

      <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed">
              Olá! Posso analisar o consumo da sua casa, identificar oportunidades de economia ou simular mudanças na sua rotina. O que você gostaria de descobrir?
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((item) => (
                <button key={item} type="button" onClick={() => void send(item)} className="rounded-full border px-3 py-1.5 text-xs text-muted-foreground transition hover:border-foreground/30 hover:text-foreground">
                  {item}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((item) => (
          <div key={item.id} className={cn("flex", item.role === "user" ? "justify-end" : "justify-start")}>
            {item.role === "user" ? (
              <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-foreground px-3 py-2 text-sm text-background">{item.content}</p>
            ) : (
              <div className={cn("w-full space-y-3 text-sm", item.error && "text-muted-foreground")}>
                <p className="whitespace-pre-line leading-relaxed">{item.content}</p>
                {item.response && <WattAIMessageBody response={item.response} onAction={runAction} onAsk={(text) => void send(text)} />}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> Calculando com os seus dados…
          </p>
        )}
      </div>

      <form onSubmit={submit} className="border-t p-3">
        <div className="flex items-end gap-2 rounded-xl border bg-card px-3 py-2 focus-within:ring-2 focus-within:ring-ring">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(input); }
            }}
            rows={1}
            maxLength={600}
            placeholder="Pergunte sobre o seu consumo…"
            className="max-h-32 min-h-[24px] flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            aria-label="Mensagem para o WattStatus AI"
          />
          <button type="submit" disabled={!input.trim() || busy} className="rounded-full bg-foreground p-1.5 text-background disabled:opacity-30" aria-label="Enviar">
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">Os números vêm dos seus cadastros e medições. A IA não altera aparelhos.</p>
      </form>
    </aside>
  );
}
