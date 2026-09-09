import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DataState({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error?: string | null;
  onRetry: () => void;
}) {
  if (loading)
    return (
      <div
        role="status"
        className="flex items-center justify-center gap-3 rounded-lg border p-8"
      >
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />{" "}
        Carregando dados…
      </div>
    );
  if (error)
    return (
      <div
        role="alert"
        className="space-y-3 rounded-lg border border-destructive/40 p-6"
      >
        <p className="flex items-center gap-2 font-medium">
          <AlertCircle className="h-5 w-5" /> Não foi possível carregar os dados
        </p>
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={onRetry}>
          Tentar novamente
        </Button>
      </div>
    );
  return null;
}
