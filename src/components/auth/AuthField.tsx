import React, { useState } from "react";
import { Eye, EyeOff, type LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface AuthFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  icon: LucideIcon;
  hint?: React.ReactNode;
  invalid?: boolean;
  labelAction?: React.ReactNode;
}

// Campo de formulário das telas de login/cadastro. Campos de senha ganham o
// botão de mostrar/ocultar automaticamente.
export function AuthField({ id, label, icon: Icon, hint, invalid, labelAction, type, className, ...props }: AuthFieldProps) {
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        {labelAction}
      </div>
      <div className="group relative">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-energy-green-light" />
        <Input
          id={id}
          type={isPassword && visible ? "text" : type}
          aria-invalid={invalid || undefined}
          className={cn(
            "h-12 rounded-xl bg-muted/40 pl-10 text-base transition-colors focus-visible:border-energy-green-light focus-visible:bg-background focus-visible:ring-energy-green-light/30 md:text-sm",
            isPassword && "pr-11",
            invalid && "border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/30",
            className
          )}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
            className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
      </div>
      {hint}
    </div>
  );
}

export function SubmitButton({ loading, label, loadingLabel }: { loading: boolean; label: string; loadingLabel: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-energy-green-light text-sm font-semibold text-energy-blue-dark shadow-lg shadow-energy-green-light/25 transition-all hover:shadow-xl hover:shadow-energy-green-light/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-energy-green-light focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-70"
    >
      <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      {loading && <span className="size-4 animate-spin rounded-full border-2 border-energy-blue-dark border-t-transparent" />}
      <span className="relative">{loading ? loadingLabel : label}</span>
    </button>
  );
}
