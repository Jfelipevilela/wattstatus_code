import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowUp, History, Loader2, Plus, Settings2, Sparkles, Square, Trash2, X } from "lucide-react";
import { useProperties } from "@/hooks/useProperties";
import { cn } from "@/lib/utils";
import {
  aiErrorMessage, STAGE_LABEL, streamChat, wattAIAccount,
  type ChartRequest, type ChatStage, type ConversationSummary, type WattAIContext, type WattAIResponse,
} from "@/lib/wattai";
import { useWattAI } from "./WattAI";
import { WattAIMessageBody } from "./WattAICards";

interface Message { id: string; role: "user" | "assistant"; content: string; response?: WattAIResponse; error?: boolean; stopped?: boolean }
interface Stored { messages: Message[]; context: WattAIContext; conversationId?: string | null }

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
const readStored = (userId: string): Stored => {
  try {
    const raw = sessionStorage.getItem(storageKey(userId));
    if (raw) return JSON.parse(raw);
  } catch { /* storage unavailable */ }
  return { messages: [], context: {} };
};

// Suggestions that follow from the page the user is on.
const pageSuggestions = (path: string) => {
  if (path.startsWith("/imoveis/")) return ["Analisar este imóvel", "Mostre os três ambientes mais caros", "Onde posso economizar aqui?"];
  if (path.startsWith("/aparelhos")) return ["Qual aparelho mais gasta?", "Quais dispositivos estão sem medição?", "Simular economia"];
  if (path.startsWith("/relatorios")) return ["Meu consumo está aumentando?", "Prever a conta deste mês"];
  return SUGGESTIONS;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: { message?: string; context?: WattAIContext; chart?: ChartRequest; nonce: number } | null;
  userId: string;
}

export default function WattAIPanel({ open, onOpenChange, request, userId }: Props) {
  const { runAction } = useWattAI();
  const location = useLocation();
  const { properties } = useProperties();
  const initial = useMemo(() => readStored(userId), [userId]);
  const [messages, setMessages] = useState<Message[]>(initial.messages);
  const [context, setContext] = useState<WattAIContext>(initial.context);
  const [conversationId, setConversationId] = useState<string | null>(initial.conversationId ?? null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<ChatStage | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<ConversationSummary[] | null>(null);
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
    try { sessionStorage.setItem(storageKey(userId), JSON.stringify({ messages: messages.slice(-MAX_STORED), context, conversationId })); }
    catch { /* storage unavailable */ }
  }, [messages, context, conversationId, userId]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => () => abort.current?.abort(), []);

  const send = async (text: string, extra?: WattAIContext, chart?: ChartRequest) => {
    const message = text.trim().slice(0, 600);
    if (!message || busy) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const nextContext = { ...context, ...extra };
    const historyForModel = messages.slice(-6).filter((item) => !item.error).map((item) => ({ role: item.role, content: item.content.slice(0, 1200) }));
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: message }]);
    setInput("");
    setBusy(true);
    setStage("context");
    try {
      const response = await streamChat(
        { message, context: nextContext, history: historyForModel, ...(conversationId ? { conversationId } : {}), ...(chart ? { chart } : {}) },
        setStage,
        controller.signal,
      );
      setContext(response.context);
      if (response.conversationId) setConversationId(response.conversationId);
      setHistory(null);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: response.message, response }]);
    } catch (error) {
      if ((error as Error)?.name === "AbortError") {
        setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: "Resposta interrompida.", stopped: true }]);
        return;
      }
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: aiErrorMessage(error), error: true }]);
    } finally {
      if (abort.current === controller) {
        setBusy(false);
        setStage(null);
      }
    }
  };
  const stop = () => abort.current?.abort();

  // Requests from other pages ("Analisar este ambiente", "Explicar este gráfico").
  useEffect(() => {
    if (!request || handled.current === request.nonce) return;
    handled.current = request.nonce;
    if (request.context) setContext((current) => ({ ...current, ...request.context }));
    if (request.message) void send(request.message, request.context, request.chart);
  }, [request]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send(input);
  };
  const reset = () => {
    abort.current?.abort();
    setBusy(false);
    setMessages([]);
    setConversationId(null);
    setShowHistory(false);
    setContext(routeProperty ? { propertyId: routeProperty } : {});
  };
  const openHistory = async () => {
    setShowHistory((value) => !value);
    if (history === null) setHistory(await wattAIAccount.conversations().catch(() => []));
  };
  const loadConversation = async (id: string) => {
    const conversation = await wattAIAccount.conversation(id).catch(() => null);
    if (!conversation) return;
    setMessages(conversation.messages.map((item) => ({ id: crypto.randomUUID(), role: item.role, content: item.content, response: item.response })));
    const last = [...conversation.messages].reverse().find((item) => item.response)?.response;
    setContext(last?.context ?? {});
    setConversationId(conversation.id);
    setShowHistory(false);
  };
  const removeConversation = async (id: string) => {
    await wattAIAccount.deleteConversation(id).catch(() => null);
    setHistory((current) => current?.filter((item) => item.id !== id) ?? null);
    if (id === conversationId) reset();
  };

  const activeProperty = properties.find((item) => item.id === context.propertyId) ?? properties.find((item) => item.isPrimary) ?? properties[0];
  const iconButton = "rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

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
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={() => void openHistory()} className={iconButton} aria-label="Conversas anteriores" aria-pressed={showHistory} title="Conversas anteriores">
            <History className="h-4 w-4" />
          </button>
          <button type="button" onClick={reset} className={iconButton} aria-label="Nova conversa" title="Nova conversa">
            <Plus className="h-4 w-4" />
          </button>
          <Link to="/ia/preferencias" onClick={() => onOpenChange(false)} className={iconButton} aria-label="Preferências da IA" title="Preferências da IA">
            <Settings2 className="h-4 w-4" />
          </Link>
          <button type="button" onClick={() => onOpenChange(false)} className={iconButton} aria-label="Fechar">
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

      {showHistory ? (
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Conversas anteriores</p>
          {history === null && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground motion-reduce:animate-none" />}
          {history?.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma conversa salva. A retenção pode ser ajustada nas preferências.</p>}
          <ul className="space-y-1">
            {history?.map((item) => (
              <li key={item.id} className="group flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted">
                <button type="button" onClick={() => void loadConversation(item.id)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm">{item.title}</p>
                  <p className="text-[11px] text-muted-foreground">{new Date(item.updatedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</p>
                </button>
                <button type="button" onClick={() => void removeConversation(item.id)} className="rounded p-1 text-muted-foreground opacity-60 hover:text-destructive group-hover:opacity-100" aria-label={`Excluir conversa ${item.title}`}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
          {messages.length === 0 && (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed">
                Olá! Posso analisar o consumo da sua casa, identificar oportunidades de economia ou simular mudanças na sua rotina. O que você gostaria de descobrir?
              </p>
              <div className="flex flex-wrap gap-2">
                {pageSuggestions(location.pathname).map((item) => (
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
                <div className={cn("w-full space-y-3 text-sm", (item.error || item.stopped) && "text-muted-foreground")}>
                  <p className="whitespace-pre-line leading-relaxed">{item.content}</p>
                  {item.error && <p className="text-[11px]">O restante do WattStatus continua funcionando normalmente.</p>}
                  {item.response && <WattAIMessageBody response={item.response} onAction={runAction} onAsk={(text) => void send(text)} />}
                </div>
              )}
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground" role="status">
              <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> {stage ? STAGE_LABEL[stage] : "Calculando…"}
            </div>
          )}
        </div>
      )}

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
          {busy ? (
            <button type="button" onClick={stop} className="rounded-full bg-foreground p-1.5 text-background" aria-label="Parar resposta" title="Parar">
              <Square className="h-4 w-4" />
            </button>
          ) : (
            <button type="submit" disabled={!input.trim()} className="rounded-full bg-foreground p-1.5 text-background disabled:opacity-30" aria-label="Enviar">
              <ArrowUp className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">Os números vêm dos seus cadastros e medições. A IA não altera aparelhos.</p>
      </form>
    </aside>
  );
}
