import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, EyeOff, Leaf, Zap, Battery } from "lucide-react";
import Icon from "@/components/logo_wattstatus_icon.png";

const SignUp = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    acceptTerms: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const validateForm = () => {
    if (
      !formData.name ||
      !formData.email ||
      !formData.password ||
      !formData.confirmPassword
    ) {
      return "Por favor, preencha todos os campos.";
    }
    if (formData.password !== formData.confirmPassword) {
      return "As senhas não coincidem.";
    }
    if (formData.password.length < 6) {
      return "A senha deve ter pelo menos 6 caracteres.";
    }
    if (!formData.acceptTerms) {
      return "Você deve aceitar os termos de uso.";
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);

    // Simulate API call
    setTimeout(() => {
      // For demo purposes, create user account
      localStorage.setItem(
        "wattstatus_user",
        JSON.stringify({
          name: formData.name,
          email: formData.email,
          isLoggedIn: true,
        })
      );
      navigate("/dashboard");
      setIsLoading(false);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-background dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo and Header */}
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="">
              <img src={Icon} alt="WattStatus" className="h-12 w-12" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-energy-800 dark:text-energy-100 mb-2">
            WATTSTATUS
          </h1>
          <p className="text-energy-600 dark:text-energy-300">
            Junte-se à revolução da energia sustentável
          </p>
        </div>

        {/* Sign Up Card */}
        <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm dark:bg-slate-800/80">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-center text-energy-800 dark:text-energy-100">
              Criar conta
            </CardTitle>
            <CardDescription className="text-center text-gray-600 dark:text-gray-400">
              Comece sua jornada rumo à sustentabilidade energética
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label
                  htmlFor="name"
                  className="text-gray-700 dark:text-gray-300"
                >
                  Nome completo
                </Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Seu nome completo"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  className="border-energy-200 dark:border-slate-600 focus:border-energy-500 dark:focus:border-energy-400 focus:ring-energy-500 dark:focus:ring-energy-400 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="email"
                  className="text-gray-700 dark:text-gray-300"
                >
                  E-mail
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={formData.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  className="border-energy-200 dark:border-slate-600 focus:border-energy-500 dark:focus:border-energy-400 focus:ring-energy-500 dark:focus:ring-energy-400 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="password"
                  className="text-gray-700 dark:text-gray-300"
                >
                  Senha
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) =>
                      handleInputChange("password", e.target.value)
                    }
                    className="border-energy-200 dark:border-slate-600 focus:border-energy-500 dark:focus:border-energy-400 focus:ring-energy-500 dark:focus:ring-energy-400 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-energy-500 dark:text-energy-400 hover:text-energy-700 dark:hover:text-energy-300"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="confirmPassword"
                  className="text-gray-700 dark:text-gray-300"
                >
                  Confirmar senha
                </Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={formData.confirmPassword}
                    onChange={(e) =>
                      handleInputChange("confirmPassword", e.target.value)
                    }
                    className="border-energy-200 dark:border-slate-600 focus:border-energy-500 dark:focus:border-energy-400 focus:ring-energy-500 dark:focus:ring-energy-400 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-energy-500 dark:text-energy-400 hover:text-energy-700 dark:hover:text-energy-300"
                  >
                    {showConfirmPassword ? (
                      <EyeOff size={20} />
                    ) : (
                      <Eye size={20} />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="terms"
                  checked={formData.acceptTerms}
                  onCheckedChange={(checked) =>
                    handleInputChange("acceptTerms", checked as boolean)
                  }
                />
                <Label
                  htmlFor="terms"
                  className="text-sm dark:text-energy-300"
                >
                  Aceito os{" "}
                  <Link
                    to="/termos"
                    className="text-energy-500 dark:text-energy-400 hover:text-energy-700 dark:hover:text-energy-300 underline"
                  >
                    termos de uso
                  </Link>{" "}
                  e{" "}
                  <Link
                    to="/privacidade"
                    className="text-energy-500 dark:text-energy-400 hover:text-energy-700 dark:hover:text-energy-300 underline"
                  >
                    política de privacidade
                  </Link>
                </Label>
              </div>

              <Button
                type="submit"
                className="w-full bg-energy-green-light hover:bg-energy-600 dark:bg-energy-600 dark:hover:bg-energy-700 text-white font-medium py-2.5"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Criando conta...</span>
                  </div>
                ) : (
                  "Criar conta"
                )}
              </Button>
            </form>

            <div className="mt-6 text-center space-y-2">
              <p className="text-sm text-energy-600 dark:text-white">
                Já tem uma conta?{" "}
                <Link
                  to="/login"
                  className="text-energy-500 dark:text-energy-400 hover:text-energy-700 dark:hover:text-energy-300 font-medium"
                >
                  Fazer login
                </Link>
              </p>
              <Link
                to="/"
                className="text-sm text-energy-500 dark:text-energy-400 hover:text-energy-700 dark:hover:text-energy-300 block"
              >
                ← Voltar ao início
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Benefits Preview */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-white/60 backdrop-blur-sm rounded-lg p-3 shadow-sm dark:bg-slate-700/60">
            <Leaf className="h-5 w-5 text-green-500 dark:text-green-400 mx-auto mb-1" />
            <p className="text-xs text-green-700 dark:text-green-300 font-medium">
              Sustentável
            </p>
          </div>
          <div className="bg-white/60 backdrop-blur-sm rounded-lg p-3 shadow-sm dark:bg-slate-700/60">
            <Zap className="h-5 w-5 text-green-500 dark:text-green-400 mx-auto mb-1" />
            <p className="text-xs text-green-700 dark:text-green-300 font-medium">
              Eficiente
            </p>
          </div>
          <div className="bg-white/60 backdrop-blur-sm rounded-lg p-3 shadow-sm dark:bg-slate-700/60">
            <Battery className="h-5 w-5 text-green-500 dark:text-green-400 mx-auto mb-1" />
            <p className="text-xs text-green-700 dark:text-green-300 font-medium">
              Inteligente
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignUp;
