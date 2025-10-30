import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  Cpu,
  DollarSign,
  Lightbulb,
  ClockFading ,
  Leaf,
  Zap,
  TrendingDown,
  Users,
  Award,
  CheckCircle,
  ArrowRight,
  Play,
  ChartColumn,
  CalendarClock,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const Index = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-gradient-to-br dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <Navbar />

      <main className="flex-grow">
        {/* Hero Section */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 dark:bg-gradient-to-r dark:from-energy-500/5 dark:to-energy-600/5"></div>
          <div className="container mx-auto px-4 pt-24 pb-16 relative">
            <div
              className={`grid lg:grid-cols-2 gap-12 items-center transition-all duration-1000 ${
                isVisible
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-8"
              }`}
            >
              <div className="space-y-8">
                <div className="space-y-4">
                  <Badge
                    variant="secondary"
                    className="bg-energy-100 text-energy-700 border-energy-200 dark:bg-energy-900 dark:text-energy-300 dark:border-energy-700"
                  >
                    <Leaf className="h-3 w-3 mr-1" />
                    Tecnologia Verde
                  </Badge>
                  <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-energy-800 dark:text-energy-100 leading-tight">
                    Monitore e Economize Energia de Forma{" "}
                    <span className="text-energy-500 dark:text-energy-400">
                      Inteligente
                    </span>
                  </h1>
                  <p className="text-lg text-energy-600 dark:text-energy-300 max-w-lg">
                    Conheça o futuro do consumo consciente de energia. Nossa
                    plataforma utiliza inteligência artificial para analisar seu
                    consumo, identificar anomalias e sugerir economias
                    significativas.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  <Button
                    size="lg"
                    className="bg-energy-400 hover:bg-energy-600 text-white shadow-lg hover:shadow-xl transition-all duration-300 group dark:bg-energy-600 dark:hover:bg-energy-700"
                    asChild
                  >
                    <Link to="/signup" className="flex items-center gap-2">
                      Comece Grátis
                      <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </Link>
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-energy-300 text-energy-700 hover:bg-energy-50 hover:border-energy-400 transition-all duration-300 dark:border-energy-600 dark:text-energy-300 dark:hover:bg-energy-900/50"
                    asChild
                  >
                    <Link to="/sobre" className="flex items-center gap-2">
                      <Play className="h-4 w-4" />
                      Ver Demo
                    </Link>
                  </Button>
                </div>

                {/* Trust Indicators */}
                <div className="flex flex-wrap items-center gap-6 pt-4">
                  <div className="flex items-center gap-2 text-sm text-energy-600 dark:text-energy-400">
                    <Users className="h-4 w-4" />
                    <span>+10.000 usuários</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-energy-600 dark:text-energy-400">
                    <Award className="h-4 w-4" />
                    <span>Certificado Verde</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-energy-600 dark:text-energy-400">
                    <TrendingDown className="h-4 w-4" />
                    <span>Até 40% economia</span>
                  </div>
                </div>
              </div>

              <div className="relative">
                <div className="relative bg-gradient-to-br from-energy-400 to-energy-600 dark:from-energy-500 dark:to-energy-700 rounded-2xl p-8 shadow-2xl">
                  <img
                    src="https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?q=80&w=600&auto=format&fit=crop&ixlib=rb-4.0.3"
                    alt="Dashboard de Energia Sustentável"
                    className="rounded-xl shadow-lg w-full h-auto object-cover"
                  />
                  <div className="absolute -bottom-4 -left-4 bg-white dark:bg-slate-800 rounded-lg p-4 shadow-lg border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-energy-400 rounded-full animate-pulse"></div>
                      <span className="text-sm font-medium text-energy-700 dark:text-energy-300">
                        Monitoramento Ativo
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-20 bg-white dark:bg-slate-800">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-energy-800 dark:text-energy-100 mb-4">
                Como podemos ajudar você
              </h2>
              <p className="text-lg text-energy-600 dark:text-energy-300 max-w-2xl mx-auto">
                Descubra como nossa plataforma transforma a maneira como você
                consome e economiza energia
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 justify-items-center p-6">
              <Card className="max-w-90 group hover:shadow-xl transition-all duration-300 border-energy-400 hover:border-energy-300 dark:border-slate-700 dark:bg-slate-700 dark:hover:border-energy-500">
                <CardContent className="pt-8 pb-6">
                  <div className="flex flex-col items-center text-center space-y-4">
                    <div className="bg-energy-100 group-hover:bg-energy-500 p-4 rounded-full transition-colors duration-300 dark:bg-slate-600 dark:group-hover:bg-energy-600">
                      <CalendarClock   className="h-8 w-8 text-energy-600 group-hover:text-energy-400  dark:text-energy-300 dark:group-hover:text-white" />
                    </div>
                    <h3 className="text-xl font-semibold text-energy-800 dark:text-energy-100">
                      Monitoramento em Tempo Real
                    </h3>
                    <p className="text-energy-600 dark:text-energy-300 leading-relaxed">
                      Acompanhe o consumo de energia da sua casa ou empresa em
                      tempo real, com análises detalhadas por período e
                      dispositivo.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="group hover:shadow-xl transition-all duration-300 border-energy-400 hover:border-energy-300 dark:border-slate-700 dark:bg-slate-700 dark:hover:border-energy-500">
                <CardContent className="pt-8 pb-6">
                  <div className="flex flex-col items-center text-center space-y-4">
                    <div className="bg-energy-100 group-hover:bg-energy-500 p-4 rounded-full transition-colors duration-300 dark:bg-slate-600 dark:group-hover:bg-energy-600">
                      <ChartColumn  className="h-8 w-8 text-energy-600 group-hover:text-energy-400  dark:text-energy-300 dark:group-hover:text-white" />
                    </div>
                    <h3 className="text-xl font-semibold text-energy-800 dark:text-energy-100">
                      Dashboards interativas
                    </h3>
                    <p className="text-energy-600 dark:text-energy-300 leading-relaxed">
                      Visualize seu consumo com gráficos dinâmicos e fáceis de
                      entender, ajudando você a tomar decisões informadas.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="w-90 group hover:shadow-xl transition-all duration-300 border-energy-400 hover:border-energy-300 dark:border-slate-700 dark:bg-slate-700 dark:hover:border-energy-500">
                <CardContent className="pt-8 pb-6">
                  <div className="flex flex-col items-center text-center space-y-4">
                    <div className="bg-energy-100 group-hover:bg-energy-500 p-4 rounded-full transition-colors duration-300 dark:bg-slate-600 dark:group-hover:bg-energy-600">
                      <DollarSign className="h-8 w-8 text-energy-600 group-hover:text-energy-400  dark:text-energy-300 dark:group-hover:text-white" />
                    </div>
                    <h3 className="text-xl font-semibold text-energy-800 dark:text-energy-100">
                      Economia Comprovada
                    </h3>
                    <p className="text-energy-600 dark:text-energy-300 leading-relaxed">
                      Receba insights personalizados para reduzir custos, com
                      estimativas claras de economia para cada recomendação.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className=" w-90 group hover:shadow-xl transition-all duration-300 border-energy-400 hover:border-energy-300 dark:border-slate-700 dark:bg-slate-700 dark:hover:border-energy-500">
                <CardContent className="pt-8 pb-6">
                  <div className="flex flex-col items-center text-center space-y-4">
                    <div className="bg-energy-100 group-hover:bg-energy-500 p-4 rounded-full transition-colors duration-300 dark:bg-slate-600 dark:group-hover:bg-energy-600">
                      <Lightbulb className="h-8 w-8 text-energy-600 group-hover:text-energy-400 dark:text-energy-300 dark:group-hover:text-white" />
                    </div>
                    <h3 className="text-xl font-semibold text-energy-800 dark:text-energy-100">
                      Dicas Personalizadas
                    </h3>
                    <p className="text-energy-600 dark:text-energy-300 leading-relaxed">
                      Receba sugestões adaptadas ao seu perfil de consumo para
                      maximizar a eficiência energética.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-16 bg-energy-600 dark:bg-energy-600 text-white">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
              <div>
                <div className="text-3xl md:text-4xl font-bold mb-2">10K+</div>
                <div className="text-energy-white dark:text-energy-200">
                  Usuários Ativos
                </div>
              </div>
              <div>
                <div className="text-3xl md:text-4xl font-bold mb-2">2.5M</div>
                <div className="text-energy-white dark:text-energy-200">
                  kWh Economizados
                </div>
              </div>
              <div>
                <div className="text-3xl md:text-4xl font-bold mb-2">
                  R$ 1.2M
                </div>
                <div className="text-energy-white dark:text-energy-200">
                  Economia Gerada
                </div>
              </div>
              <div>
                <div className="text-3xl md:text-4xl font-bold mb-2">85%</div>
                <div className="text-energy-white dark:text-energy-200">
                  Satisfação
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Call to Action */}
        <section className="py-20 bg-gradient-to-r from-energy-50 to-energy-100 dark:from-slate-800 dark:to-slate-900">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 md:p-12 border border-slate-200 dark:border-slate-700">
                <div className="flex justify-center mb-6">
                  <div className="bg-energy-600 p-4 rounded-full">
                    <Zap className="h-12 w-12 text-white" />
                  </div>
                </div>
                <h2 className="text-3xl md:text-4xl font-bold text-energy-800 dark:text-energy-100 mb-4">
                  Pronto para economizar energia e dinheiro?
                </h2>
                <p className="text-lg text-energy-600 dark:text-energy-300 mb-8 max-w-2xl mx-auto">
                  Junte-se a milhares de pessoas e empresas que já reduziram
                  seus gastos com energia e contribuem para um planeta mais
                  sustentável.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button
                    size="lg"
                    className="bg-energy-600 hover:bg-energy-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 dark:bg-energy-600 dark:hover:bg-energy-700"
                    asChild
                  >
                    <Link to="/dashboard">Acessar Dashboard</Link>
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-energy-300 text-energy-700 hover:bg-energy-50 dark:border-energy-600 dark:text-energy-300 dark:hover:bg-energy-900/50"
                    asChild
                  >
                    <Link to="/signup">Criar Conta Gratuita</Link>
                  </Button>
                </div>

                {/* Benefits List */}
                {/* <div className="grid md:grid-cols-3 gap-6 mt-12 pt-8 border-t border-energy-100 dark:border-slate-700">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-energy-500" />
                    <span className="text-energy-700 dark:text-energy-300">
                      7 dias grátis
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-energy-500" />
                    <span className="text-energy-700 dark:text-energy-300">
                      Sem cartão de crédito
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-energy-500" />
                    <span className="text-energy-700 dark:text-energy-300">
                      Suporte 24/7
                    </span>
                  </div>
                </div> */}
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Index;
