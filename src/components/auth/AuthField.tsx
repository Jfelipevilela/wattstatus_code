import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff, type LucideIcon } from "lucide-react";

interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  icon: LucideIcon;
  hint?: ReactNode;
  error?: string;
}

export function AuthField({ id, label, icon: Icon, hint, error, type, className, ...props }: AuthFieldProps) {
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";
  const description = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ");
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-field-control">
        <Icon className="auth-field-icon" size={17} aria-hidden="true" />
        <input
          {...props}
          id={id}
          type={isPassword && visible ? "text" : type}
          className={`auth-input${isPassword ? " auth-input-password" : ""}${className ? ` ${className}` : ""}`}
          aria-invalid={Boolean(error)}
          aria-describedby={description || undefined}
        />
        {isPassword && (
          <button type="button" className="auth-password-toggle" onClick={() => setVisible((value) => !value)}
            aria-label={visible ? "Ocultar senha" : "Mostrar senha"} aria-pressed={visible}>
            {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        )}
      </div>
      {hint && <div id={`${id}-hint`} className="auth-field-hint">{hint}</div>}
      {error && <p id={`${id}-error`} className="auth-field-error" role="alert">{error}</p>}
    </div>
  );
}

export function SubmitButton({ loading, label, loadingLabel }: { loading: boolean; label: string; loadingLabel: string }) {
  return (
    <button type="submit" disabled={loading} className="auth-submit" aria-busy={loading}>
      {loading && <span className="auth-spinner" aria-hidden="true" />}
      {loading ? loadingLabel : label}
    </button>
  );
}
