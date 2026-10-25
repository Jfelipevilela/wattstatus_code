import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, Lock, Mail, ShieldCheck, User, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/components/ui/use-toast";
import { notifyError } from "@/lib/error-toast";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthField, SubmitButton } from "@/components/auth/AuthField";
import { cn } from "@/lib/utils";

const MIN_PASSWORD = 15;

// Força estimada só para orientar o usuário; o backend é quem valida.
function passwordStrength(pw: string) {
  if (!pw) return { score: 0, label: "", color: "" };
  let score = 0;
  if (pw.length >= MIN_PASSWORD) score++;
  if (pw.length >= 20) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  if (pw.length < MIN_PASSWORD) score = Math.min(score, 1);
  const levels = [
    { label: "Muito fraca", color: "bg-red-500" },
    { label: "Fraca", color: "bg-orange-500" },
    { label: "Razoável", color: "bg-amber-500" },
    { label: "Boa", color: "bg-lime-500" },
    { label: "Forte", color: "bg-energy-green-light" },
  ];
  return { score, ...levels[score] };
}

const SignUp = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    acceptTerms: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { register } = useAuth();

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const strength = passwordStrength(formData.password);
  const longEnough = formData.password.length >= MIN_PASSWORD;
  const confirmTouched = formData.confirmPassword.length > 0;
  const passwordsMatch = formData.password === formData.confirmPassword;

  const validateForm = () => {
    if (
      !formData.name ||
      !formData.email ||
      !formData.password ||
      !formData.confirmPassword
    ) {
      return "Por favor, preencha todos os campos.";
    }
    if (!passwordsMatch) {
      return "As senhas não coincidem.";
    }
    if (!longEnough) {
      return `A senha deve ter pelo menos ${MIN_PASSWORD} caracteres.`;
    }
    if (!formData.acceptTerms) {
      return "Você deve aceitar os termos de uso.";
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      notifyError(validationError, { title: "Revise os dados" });
      return;
    }

    setIsLoading(true);
    try {
      await register(
        formData.name,
        formData.email,
        formData.password,
        formData.confirmPassword
      );
      toast({
        title: "Conta criada com sucesso!",
        description: "Redirecionando para o dashboard...",
      });
      navigate("/dashboard");
    } catch (err) {
      notifyError(err, {
        title: "Erro ao criar conta",
        fallbackMessage: "Erro ao criar conta.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Crie sua conta"
      subtitle="Comece a entender e reduzir seu consumo de energia."
      footer={
        <>
          Já tem uma conta?{" "}
          <Link to="/login" className="font-semibold text-energy-700 hover:underline dark:text-energy-green-light">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <AuthField
          id="name"
          label="Nome completo"
          icon={User}
          type="text"
          autoComplete="name"
          maxLength={100}
          placeholder="Seu nome"
          value={formData.name}
          onChange={(e) => handleInputChange("name", e.target.value)}
          autoFocus
          required
        />
        <AuthField
          id="email"
          label="E-mail"
          icon={Mail}
          type="email"
          autoComplete="username"
          maxLength={254}
          placeholder="seu@email.com"
          value={formData.email}
          onChange={(e) => handleInputChange("email", e.target.value)}
          required
        />
        <AuthField
          id="password"
          label="Senha"
          icon={Lock}
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD}
          maxLength={128}
          placeholder={`Mínimo de ${MIN_PASSWORD} caracteres`}
          value={formData.password}
          onChange={(e) => handleInputChange("password", e.target.value)}
          aria-describedby="password-hint"
          required
          hint={
            <div id="password-hint" className="space-y-2 pt-1">
              <div className="flex gap-1" aria-hidden>
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-1 flex-1 rounded-full bg-muted transition-colors duration-300",
                      strength.score >= i && strength.color
                    )}
                  />
                ))}
              </div>
              <div className="flex items-center justify-between text-xs">
                <span
                  className={cn(
                    "flex items-center gap-1",
                    longEnough ? "text-energy-700 dark:text-energy-green-light" : "text-muted-foreground"
                  )}
                >
                  {longEnough ? <Check className="size-3.5" /> : <span className="size-3.5 text-center">•</span>}
                  {formData.password.length}/{MIN_PASSWORD} caracteres
                </span>
                {strength.label && <span className="font-medium text-muted-foreground">{strength.label}</span>}
              </div>
            </div>
          }
        />
        <AuthField
          id="confirmPassword"
          label="Confirmar senha"
          icon={ShieldCheck}
          type="password"
          autoComplete="new-password"
          maxLength={128}
          placeholder="Repita a senha"
          value={formData.confirmPassword}
          onChange={(e) => handleInputChange("confirmPassword", e.target.value)}
          invalid={confirmTouched && !passwordsMatch}
          required
          hint={
            confirmTouched && (
              <p
                className={cn(
                  "flex items-center gap-1 text-xs",
                  passwordsMatch ? "text-energy-700 dark:text-energy-green-light" : "text-red-600 dark:text-red-400"
                )}
                role="status"
              >
                {passwordsMatch ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                {passwordsMatch ? "As senhas coincidem" : "As senhas não coincidem"}
              </p>
            )
          }
        />

        <label
          htmlFor="terms"
          className="flex cursor-pointer items-start gap-3 rounded-xl border bg-muted/30 p-3.5 text-sm leading-relaxed text-muted-foreground transition-colors has-[[data-state=checked]]:border-energy-green-light/50 has-[[data-state=checked]]:bg-energy-green-light/5"
        >
          <Checkbox
            id="terms"
            checked={formData.acceptTerms}
            onCheckedChange={(checked) => handleInputChange("acceptTerms", checked === true)}
            className="mt-0.5 data-[state=checked]:border-energy-green-light data-[state=checked]:bg-energy-green-light data-[state=checked]:text-energy-blue-dark"
          />
          <span>
            Li e aceito os{" "}
            <Link to="/termos" className="font-medium text-foreground underline underline-offset-2">
              termos de uso
            </Link>{" "}
            e a{" "}
            <Link to="/privacidade" className="font-medium text-foreground underline underline-offset-2">
              política de privacidade
            </Link>
            .
          </span>
        </label>

        <SubmitButton loading={isLoading} label="Criar conta" loadingLabel="Criando conta..." />
      </form>
    </AuthLayout>
  );
};

export default SignUp;
