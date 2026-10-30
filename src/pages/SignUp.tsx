import { useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Lock, Mail, ShieldCheck, User } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import { notifyError } from "@/lib/error-toast";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthField, SubmitButton } from "@/components/auth/AuthField";

const MIN_PASSWORD = 15;
type Fields = { name: string; email: string; password: string; confirmPassword: string; acceptTerms: boolean };
type Errors = Partial<Record<keyof Fields, string>>;

function strengthScore(password: string) {
  if (!password) return 0;
  let score = password.length >= MIN_PASSWORD ? 1 : 0;
  if (password.length >= 20) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  return Math.max(1, score);
}

export default function SignUp() {
  const [form, setForm] = useState<Fields>({ name: "", email: "", password: "", confirmPassword: "", acceptTerms: false });
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);
  const justRegistered = useRef(false);
  const navigate = useNavigate();
  const { register, user } = useAuth();
  const score = strengthScore(form.password);
  const change = (field: keyof Fields, value: string | boolean) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };
  const validate = (): Errors => {
    const next: Errors = {};
    if (form.name.trim().length < 2) next.name = "Informe um nome com pelo menos 2 caracteres.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = "Informe um e-mail válido.";
    if (form.password.length < MIN_PASSWORD) next.password = `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`;
    else if (form.password.length > 128) next.password = "A senha deve ter no máximo 128 caracteres.";
    if (!form.confirmPassword) next.confirmPassword = "Confirme sua senha.";
    else if (form.password !== form.confirmPassword) next.confirmPassword = "As senhas não coincidem.";
    if (!form.acceptTerms) next.acceptTerms = "Confirme o aviso de homologação para continuar.";
    return next;
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    const next = validate();
    setErrors(next);
    const first = Object.keys(next)[0];
    if (first) { document.getElementById(first)?.focus(); return; }
    submitting.current = true;
    setLoading(true);
    try {
      await register(form.name.trim(), form.email.trim(), form.password, form.confirmPassword, form.acceptTerms);
      justRegistered.current = true;
      navigate("/onboarding", { replace: true });
    } catch (error) {
      notifyError(error, { title: "Erro ao criar conta", fallbackMessage: "Não foi possível criar a conta. Tente novamente." });
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  if (user && !loading && !justRegistered.current) return <Navigate to="/dashboard" replace />;
  return (
    <AuthLayout view="signup" title="Comece a entender sua energia." subtitle="Crie sua conta e descubra o consumo da sua casa."
      footer={<>Já tem uma conta? <Link to="/login">Entrar</Link></>}>
      <form className="auth-form" onSubmit={submit} noValidate>
        <AuthField id="name" label="Nome completo" icon={User} type="text" autoComplete="name" maxLength={100}
          placeholder="Seu nome" value={form.name} onChange={(e) => change("name", e.target.value)} error={errors.name} autoFocus required />
        <AuthField id="email" label="E-mail" icon={Mail} type="email" autoComplete="username" maxLength={254}
          placeholder="seu@email.com" value={form.email} onChange={(e) => change("email", e.target.value)} error={errors.email} required />
        <AuthField id="password" label="Senha" icon={Lock} type="password" autoComplete="new-password" minLength={MIN_PASSWORD} maxLength={128}
          placeholder="Pelo menos 15 caracteres" value={form.password} onChange={(e) => change("password", e.target.value)} error={errors.password} required
          hint={<><div className="auth-strength-track" aria-hidden="true">{[1, 2, 3, 4].map((step) => <span key={step} data-active={score >= step} />)}</div>
            <span>{form.password ? `Força ${["", "inicial", "razoável", "boa", "forte"][score]}. ` : ""}Use pelo menos 15 caracteres.</span></>} />
        <AuthField id="confirmPassword" label="Confirmar senha" icon={ShieldCheck} type="password" autoComplete="new-password" maxLength={128}
          placeholder="Repita a senha" value={form.confirmPassword} onChange={(e) => change("confirmPassword", e.target.value)}
          error={errors.confirmPassword} required hint={form.confirmPassword && form.password === form.confirmPassword ? "As senhas coincidem." : undefined} />
        <div>
          <div className="auth-terms">
            <Checkbox id="acceptTerms" checked={form.acceptTerms} onCheckedChange={(checked) => change("acceptTerms", checked === true)}
              aria-invalid={Boolean(errors.acceptTerms)} aria-describedby="legal-note terms-error" />
            <label htmlFor="acceptTerms">Entendi que esta conta é para homologação local e que os documentos jurídicos ainda estão pendentes.</label>
          </div>
          {errors.acceptTerms && <p id="terms-error" className="auth-field-error" role="alert">{errors.acceptTerms}</p>}
          <p id="legal-note" className="auth-legal-note"><Link to="/termos">Termos</Link> e <Link to="/privacidade">Privacidade</Link> pendentes de aprovação. Cadastro somente para homologação local.</p>
        </div>
        <SubmitButton loading={loading} label="Criar conta" loadingLabel="Criando conta..." />
      </form>
    </AuthLayout>
  );
}
