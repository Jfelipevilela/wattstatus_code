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
import { Eye, EyeOff, Leaf, Zap } from "lucide-react";
import Icon from "@/components/logo_wattstatus_icon.png";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    // Simple validation
    if (!email || !password) {
      setError("Por favor, preencha todos os campos.");
      setIsLoading(false);
      return;
    }

    // Simulate API call
    setTimeout(() => {
      // For demo purposes, accept any email/password combination
      localStorage.setItem(
        "wattstatus_user",
        JSON.stringify({ email, isLoggedIn: true })
      );
      navigate("/dashboard");
      setIsLoading(false);
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo and Header */}
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-energy-500 p-3 rounded-full shadow-lg">
              <img src={Icon} alt="WattStatus" className="h-8 w-8" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-energy-800 dark:text-energy-100 mb-2">
            WATTSTATUS
          </h1>
          <p className="text-energy-600 dark:text-energy-300">
            Energia inteligente para um futuro sustentável
          </p>
        </div>

        {/* Login Card */}
        <Card className="shadow-xl border-0 bg-background/80 backdrop-blur-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-center text-energy-800 dark:text-energy-100">
              Entrar na sua conta
            </CardTitle>
            <CardDescription className="text-center text-gray-600 dark:text-gray-400">
              Acesse seu dashboard de energia sustentável
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
                  htmlFor="email"
                  className="text-gray-700 dark:text-gray-300"
                >
                  E-mail
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
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

              <Button
                type="submit"
                className="w-full bg-energy-green-light hover:bg-energy-600 dark:bg-energy-600 dark:hover:bg-energy-700 text-white font-medium py-2.5"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Entrando...</span>
                  </div>
                ) : (
                  "Entrar"
                )}
              </Button>
            </form>

            <div className="mt-6 text-center space-y-2">
              <p className="text-sm text-energy-600 dark:text-energy-400">
                Não tem uma conta?{" "}
                <Link
                  to="/signup"
                  className="text-energy-500 dark:text-energy-400 hover:text-energy-700 dark:hover:text-energy-300 font-medium"
                >
                  Criar conta
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

        {/* Features Preview */}
        <div className="grid grid-cols-2 gap-4 text-center">
          <div className="bg-background/60 backdrop-blur-sm rounded-lg p-4 shadow-sm">
            <Leaf className="h-6 w-6 text-energy-500 dark:text-energy-400 mx-auto mb-2" />
            <p className="text-xs text-energy-700 dark:text-energy-300 font-medium">
              Monitoramento Sustentável
            </p>
          </div>
          <div className="bg-background/60 backdrop-blur-sm rounded-lg p-4 shadow-sm">
            <Zap className="h-6 w-6 text-energy-500 dark:text-energy-400 mx-auto mb-2" />
            <p className="text-xs text-energy-700 dark:text-energy-300 font-medium">
              Economia Inteligente
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
