import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  page: number;
  totalPages: number;
  disabled?: boolean;
  onPageChange: (page: number) => void;
}

export default function CatalogPagination({ page, totalPages, disabled = false, onPageChange }: Props) {
  const id = useId();
  const lastPage = Math.min(1000, totalPages);
  const [target, setTarget] = useState(String(page));
  useEffect(() => setTarget(String(page)), [page]);
  const chosen = Number(target);
  const valid = target.trim() !== "" && Number.isInteger(chosen) && chosen >= 1 && chosen <= lastPage;
  const pages = [...new Set([1, ...Array.from({ length: 5 }, (_, i) => page - 2 + i), lastPage])]
    .filter(value => value >= 1 && value <= lastPage).sort((a, b) => a - b);
  return <nav aria-label="Paginação do catálogo" className="space-y-3">
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Button type="button" variant="outline" disabled={disabled || page <= 1} onClick={() => onPageChange(page - 1)}>Anterior</Button>
      {pages.map((value, index) => <span key={value} className="inline-flex items-center gap-2">
        {index > 0 && value - pages[index - 1] > 1 && <span aria-hidden="true">…</span>}
        <Button type="button" variant={value === page ? "default" : "outline"} aria-label={`Página ${value}`}
          aria-current={value === page ? "page" : undefined} disabled={disabled} onClick={() => onPageChange(value)}>{value}</Button>
      </span>)}
      <Button type="button" variant="outline" disabled={disabled || page >= lastPage} onClick={() => onPageChange(page + 1)}>Próxima</Button>
    </div>
    <form className="flex flex-wrap items-center justify-center gap-2" onSubmit={event => {
      event.preventDefault(); if (valid && !disabled) onPageChange(chosen);
    }}>
      <Label htmlFor={id}>Ir para página</Label>
      <Input id={id} type="number" min={1} max={lastPage} step={1} inputMode="numeric" value={target}
        onChange={event => setTarget(event.target.value)} disabled={disabled} aria-invalid={!valid}
        className="h-11 w-24" />
      <span className="text-sm text-muted-foreground">de {lastPage}</span>
      <Button type="submit" variant="outline" disabled={disabled || !valid}>Ir</Button>
    </form>
    {totalPages > lastPage && <p className="text-center text-xs text-muted-foreground">Refine a busca para acessar resultados além das primeiras {lastPage} páginas.</p>}
  </nav>;
}
