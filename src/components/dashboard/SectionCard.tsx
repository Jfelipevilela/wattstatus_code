import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  description?: ReactNode;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function SectionCard({ title, description, aside, className, children }: Props) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-2xl border bg-card p-5 shadow-sm sm:p-6",
        className,
      )}
    >
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}
