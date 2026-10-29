import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
  const csrfPrefetched = useRef(false);
  const navigate = useNavigate();
  const { login, loading: sessionLoading } = useAuth();
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

    if (!email || !password) {
      notifyError("Por favor, preencha todos os campos.", {
        title: "Campos obrigatórios",
      });
      return;
    }

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
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Bem-vindo de volta"
      subtitle="Entre para acompanhar o consumo da sua casa."
      footer={
        <>
          Não tem uma conta?{" "}
          <Link to="/signup" className="font-semibold text-energy-700 hover:underline dark:text-energy-green-light">
            Criar conta grátis
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} onFocusCapture={prefetchCsrf} className="space-y-5" noValidate>
        <AuthField
          id="email"
          label="E-mail"
          icon={Mail}
          type="email"
          autoComplete="username"
          maxLength={254}
          placeholder="seu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <SubmitButton loading={isLoading} label="Entrar" loadingLabel="Entrando..." />
      </form>
    </AuthLayout>
  );
};

export default Login;
