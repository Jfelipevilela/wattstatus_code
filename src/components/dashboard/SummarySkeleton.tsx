import { Skeleton } from "@/components/ui/skeleton";

export function SummarySkeleton() {
  return (
    <div role="status" aria-label="Carregando resumo" className="space-y-8">
      <Skeleton className="h-72 w-full rounded-3xl" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
      <span className="sr-only">Carregando dados…</span>
    </div>
  );
}
