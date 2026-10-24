import { createContext, lazy, Suspense, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import type { WattAIAction, WattAIContext } from "@/lib/wattai";

// The panel and simulator are loaded only when first opened, so the AI adds
// nothing to the main bundle.
const WattAIPanel = lazy(() => import("./WattAIPanel"));
const WattAISimulator = lazy(() => import("./WattAISimulator"));

export interface SimulatorTarget { propertyId: string; applianceId: string; proposedHours?: number }
interface AssistantRequest { message?: string; context?: WattAIContext; nonce: number }

interface WattAIApi {
  openAssistant: (request?: { message?: string; context?: WattAIContext }) => void;
  openSimulator: (target: SimulatorTarget) => void;
  runAction: (action: WattAIAction) => void;
}

const WattAIContextValue = createContext<WattAIApi | null>(null);

// Safe no-op outside the provider (public pages, tests).
export const useWattAI = (): WattAIApi =>
  useContext(WattAIContextValue) ?? { openAssistant: () => {}, openSimulator: () => {}, runAction: () => {} };

const HIDDEN_ON = ["/", "/login", "/signup", "/sobre"];

export function WattAIProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [request, setRequest] = useState<AssistantRequest | null>(null);
  const [simulator, setSimulator] = useState<SimulatorTarget | null>(null);

  const openAssistant = useCallback((next?: { message?: string; context?: WattAIContext }) => {
    setLoaded(true);
    setOpen(true);
    if (next) setRequest({ ...next, nonce: Date.now() });
  }, []);
  const openSimulator = useCallback((target: SimulatorTarget) => setSimulator(target), []);

  const runAction = useCallback((action: WattAIAction) => {
    switch (action.type) {
      case "open_property": {
        const params = new URLSearchParams();
        if (action.roomId) params.set("sala", action.roomId);
        if (action.applianceId) params.set("aparelho", action.applianceId);
        navigate(`/imoveis/${encodeURIComponent(action.propertyId)}${params.size ? `?${params}` : ""}`);
        // Step aside so the plan and the room panel are visible; the
        // conversation is kept and reopens where it was.
        setOpen(false);
        break;
      }
      case "open_simulator":
        setSimulator({ propertyId: action.propertyId, applianceId: action.applianceId, proposedHours: action.proposedHours });
        break;
      case "open_page":
        if (action.path.startsWith("/")) navigate(action.path);
        setOpen(false);
        break;
      case "ask":
        openAssistant({ message: action.message });
        break;
    }
  }, [navigate, openAssistant]);

  const api = useMemo(() => ({ openAssistant, openSimulator, runAction }), [openAssistant, openSimulator, runAction]);
  const visible = Boolean(user) && !HIDDEN_ON.includes(location.pathname) && !location.pathname.startsWith("/integracoes/smartthings/callback");

  return (
    <WattAIContextValue.Provider value={api}>
      {children}
      {visible && (
        <>
          {!open && (
            <button
              type="button"
              onClick={() => openAssistant()}
              className="fixed bottom-5 right-5 z-40 inline-flex h-11 items-center gap-2 rounded-full border bg-card px-4 text-sm font-medium text-foreground shadow-lg transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Abrir WattStatus AI"
            >
              <Sparkles className="h-4 w-4 text-primary" aria-hidden />
              <span className="hidden sm:inline">WattStatus AI</span>
            </button>
          )}
          {loaded && (
            <Suspense fallback={null}>
              <WattAIPanel open={open} onOpenChange={setOpen} request={request} userId={user!.id} />
            </Suspense>
          )}
          {simulator && (
            <Suspense fallback={null}>
              <WattAISimulator target={simulator} onClose={() => setSimulator(null)} />
            </Suspense>
          )}
        </>
      )}
    </WattAIContextValue.Provider>
  );
}
