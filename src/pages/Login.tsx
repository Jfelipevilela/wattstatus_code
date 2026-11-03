import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Lock, Mail } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { notifyError } from "@/lib/error-toast";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthField, SubmitButton } from "@/components/auth/AuthField";
import { getCsrfToken } from "@/lib/api";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const submitting = useRef(false);
  const csrfPrefetched = useRef(false);
  const navigate = useNavigate();
  const { login, loading: sessionLoading, user } = useAuth();
  const prefetchCsrf = useCallback(() => {
    if (sessionLoading || csrfPrefetched.current) return;
    csrfPrefetched.current = true;
    void getCsrfToken().catch(() => { csrfPrefetched.current = false; });
  }, [sessionLoading]);

  useEffect(() => {
    if (document.activeElement?.id === "email") prefetchCsrf();
  }, [prefetchCsrf]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;
    const nextErrors: typeof errors = {};
    if (!email.trim()) nextErrors.email = "Informe seu e-mail.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) nextErrors.email = "Informe um e-mail válido.";
    if (!password) nextErrors.password = "Informe sua senha.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      document.getElementById(nextErrors.email ? "email" : "password")?.focus();
      return;
    }
    submitting.current = true;
    setIsLoading(true);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      notifyError(err, {
        title: "Erro ao entrar",
        fallbackMessage: "Erro ao entrar.",
      });
    } finally {
      submitting.current = false;
      setIsLoading(false);
    }
  };

  if (user && !isLoading) return <Navigate to="/dashboard" replace />;
  return (
    <AuthLayout
      view="login"
      title="Bem-vindo de volta."
      subtitle="Acompanhe sua energia de onde parou."
      footer={
        <>
          Não tem uma conta?{" "}
          <Link to="/signup">
            Criar conta
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} onFocusCapture={prefetchCsrf} className="auth-form" noValidate>
        <AuthField
          id="email"
          label="E-mail"
          icon={Mail}
          type="email"
          autoComplete="username"
          maxLength={254}
          placeholder="seu@email.com"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setErrors((value) => ({ ...value, email: undefined })); }}
          error={errors.email}
          autoFocus
          required
        />
        <AuthField
          id="password"
          label="Senha"
          icon={Lock}
          type="password"
          autoComplete="current-password"
          maxLength={1024}
          placeholder="Sua senha"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setErrors((value) => ({ ...value, password: undefined })); }}
          error={errors.password}
          required
        />
        <SubmitButton loading={isLoading} label="Entrar" loadingLabel="Entrando..." />
      </form>
    </AuthLayout>
  );
};

export default Login;
