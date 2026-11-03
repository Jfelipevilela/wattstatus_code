import type { CatalogSource, EnergyProfile } from "../../backend/src/modules/catalog/catalog.types";
import { catalogSourceInfo } from "@/lib/catalog-source-info";
import { cn } from "@/lib/utils";

export default function CatalogReferenceDetails({ source, profile, className }: {
  source: CatalogSource; profile: EnergyProfile; className?: string;
}) {
  const info = catalogSourceInfo(source, profile);
  return <details className={cn("text-xs", className)}>
    <summary>Sobre a referência de consumo</summary>
    <div className="mt-2 flex flex-col gap-2">
      {info.entries.length > 0 && <ul className="flex flex-col gap-1">{info.entries.map(entry => <li key={entry.label}>
        {entry.label}{entry.complementary && (entry.url
          ? <> · <a className="text-primary underline underline-offset-4" href={entry.url} target="_blank" rel="noopener noreferrer">Consultar fonte complementar</a></>
          : " · Fonte complementar sem página de consulta disponível")}
      </li>)}</ul>}
      {info.url && <a className="text-primary underline underline-offset-4" href={info.url} target="_blank" rel="noopener noreferrer">Consultar a página da fonte</a>}
      <p className="text-muted-foreground">{source.type === "WATTSTATUS_GENERIC"
        ? "Perfil típico estimado, sem ensaio específico para este modelo. Confira a etiqueta do aparelho."
        : "Dados de referência ajudam na comparação. O consumo real depende das condições de uso."}</p>
    </div>
  </details>;
}
