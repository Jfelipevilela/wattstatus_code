import React from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import {
  Zap,
  Cpu,
  BarChart3,
  Leaf,
  Users,
  Building,
  DollarSign,
  Brain,
  TrendingUp,
  Calendar,
  Globe,
  Home,
  Mail,
  Phone,
  MapPin,
  Award,
} from "lucide-react";

const Sobre = () => {
  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Cabeçalho */}
      <Navbar />

      <main className="flex-grow container mx-auto px-4 pt-24 pb-10">
        {/* Título e Subtítulo */}
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold mb-2 text-blue-800 dark:text-energy-blue-light">
            Sobre o WattStatus
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-300">
            Monitoramento inteligente para economia de energia e
            sustentabilidade
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            Sua energia, sob controle. Seu consumo, mais consciente.
          </p>
        </div>

        {/* Contextualização do Problema */}
        <div className="grid md:grid-cols-2 gap-10 mb-16">
          <div>
            <h2 className="text-2xl font-bold mb-4 text-blue-800 dark:text-energy-blue-light">
              Contextualização do Problema
            </h2>
            <p className="text-slate-600 dark:text-slate-300 mb-6">
              O aumento constante do consumo de energia no Brasil evidencia a
              necessidade de soluções que ajudem consumidores e empresas a
              entender e reduzir seus gastos de forma eficiente.
            </p>
            <p className="text-slate-600 dark:text-slate-300 mb-6">
              Segundo dados da Empresa de Pesquisa Energética (EPE), o consumo
              nacional de eletricidade deve continuar crescendo até 2025, com
              destaque para o aumento das tarifas.
            </p>
            <p className="text-slate-600 dark:text-slate-300 mb-6">
              Essa tendência reforça a importância de ferramentas que permitam
              um uso mais consciente e sustentável da energia, promovendo
              economia e responsabilidade ambiental.
            </p>
          </div>

          <div className="relative">
            <img
              src="https://www.futurosolar.com.br/wp-content/uploads/2018/10/energia-sustentavel.jpg"
              alt="Energia sustentável"
              className="rounded-lg shadow-lg w-full h-auto object-cover"
            />
            <div className="absolute bottom-4 left-4 bg-white/90 dark:bg-slate-800/90 p-4 rounded-md shadow-sm">
              <p className="text-sm font-medium text-blue-800 dark:text-energy-blue-light">
                Monitoramento inteligente para um futuro sustentável
              </p>
            </div>
          </div>
        </div>

        {/* Nossa Solução */}
        <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-sm mb-16">
          <h2 className="text-2xl font-bold mb-6 text-center text-blue-800 dark:text-energy-blue-light">
            Nossa Solução
          </h2>
          <p className="text-slate-600 dark:text-slate-300 mb-6 text-center max-w-3xl mx-auto">
            Diante desse cenário, o WattStatus surge como uma solução inovadora
            para monitoramento energético inteligente.
          </p>
          <p className="text-slate-600 dark:text-slate-300 mb-6 text-center max-w-3xl mx-auto">
            A plataforma permite que usuários acompanhem o consumo de energia em
            tempo real, visualizem relatórios detalhados e recebam alertas
            automáticos quando um aparelho consome acima do ideal.
          </p>
          <p className="text-slate-600 dark:text-slate-300 text-center max-w-3xl mx-auto">
            Além disso, promove transparência, economia e sustentabilidade,
            apoiando metas ambientais e hábitos de consumo consciente.
          </p>
        </div>

        {/* Benefícios Principais */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold mb-8 text-center text-blue-800 dark:text-energy-blue-light">
            Benefícios Principais
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-lg border border-slate-200 dark:border-slate-700 text-center hover:shadow-md transition-shadow">
              <div className="mx-auto bg-energy-green-light/10 dark:bg-energy-green-light/20 p-4 rounded-full w-16 h-16 flex items-center justify-center mb-4">
                <DollarSign className="h-8 w-8 text-energy-green-light" />
              </div>
              <h3 className="font-bold mb-2 text-slate-900 dark:text-slate-100">
                Economia
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Reduza sua conta de energia em até 30%
              </p>
            </div>

            <div className="bg-white dark:bg-slate-800 p-6 rounded-lg border border-slate-200 dark:border-slate-700 text-center hover:shadow-md transition-shadow">
              <div className="mx-auto bg-energy-blue-light/10 dark:bg-energy-blue-light/20 p-4 rounded-full w-16 h-16 flex items-center justify-center mb-4">
                <TrendingUp className="h-8 w-8 text-energy-blue-light" />
              </div>
              <h3 className="font-bold mb-2 text-slate-900 dark:text-slate-100">
                Transparência
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Acompanhe o consumo em tempo real
              </p>
            </div>

            <div className="bg-white dark:bg-slate-800 p-6 rounded-lg border border-slate-200 dark:border-slate-700 text-center hover:shadow-md transition-shadow">
              <div className="mx-auto bg-energy-yellow/10 dark:bg-energy-yellow/20 p-4 rounded-full w-16 h-16 flex items-center justify-center mb-4">
                <BarChart3 className="h-8 w-8 text-energy-yellow" />
              </div>
              <h3 className="font-bold mb-2 text-slate-900 dark:text-slate-100">
                Relatórios
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Tenha análises mensais detalhadas
              </p>
            </div>

            <div className="bg-white dark:bg-slate-800 p-6 rounded-lg border border-slate-200 dark:border-slate-700 text-center hover:shadow-md transition-shadow">
              <div className="mx-auto bg-energy-green-dark/10 dark:bg-energy-green-dark/20 p-4 rounded-full w-16 h-16 flex items-center justify-center mb-4">
                <Leaf className="h-8 w-8 text-energy-green-dark" />
              </div>
              <h3 className="font-bold mb-2 text-slate-900 dark:text-slate-100">
                Sustentabilidade
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Reduza sua pegada de carbono
              </p>
            </div>
          </div>
        </div>

        {/* Cenário Energético Brasileiro */}
        <div className="bg-gradient-to-r from-energy-blue-light/10 to-energy-green-light/10 dark:from-energy-blue-light/5 dark:to-energy-green-light/5 p-8 rounded-xl mb-16">
          <h2 className="text-2xl font-bold mb-6 text-center text-blue-800 dark:text-energy-blue-light">
            Cenário Energético Brasileiro 2025
          </h2>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="mx-auto bg-blue-800/10 dark:bg-blue-800/20 p-4 rounded-full w-16 h-16 flex items-center justify-center mb-4">
                <Zap className="h-8 w-8 text-blue-800" />
              </div>
              <h3 className="text-2xl font-bold text-blue-800 dark:text-energy-blue-light mb-2">
                47.850 GWh
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                Consumo Nacional
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Fevereiro 2025 - Recorde histórico
              </p>
            </div>

            <div className="text-center">
              <div className="mx-auto bg-energy-yellow/10 dark:bg-energy-yellow/20 p-4 rounded-full w-16 h-16 flex items-center justify-center mb-4">
                <TrendingUp className="h-8 w-8 text-energy-yellow" />
              </div>
              <h3 className="text-2xl font-bold text-energy-yellow mb-2">
                +6,3%
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                Aumento Tarifário
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Projeção ANEEL para 2025
              </p>
            </div>

            <div className="text-center">
              <div className="mx-auto bg-green-800/10 dark:bg-green-800/20 p-4 rounded-full w-16 h-16 flex items-center justify-center mb-4">
                <Globe className="h-8 w-8 text-green-800" />
              </div>
              <h3 className="text-2xl font-bold text-green-800 mb-2">34%</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                Energias Renováveis
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Eólica + Solar - Agosto 2025
              </p>
            </div>
          </div>
        </div>

        {/* Como Nossa Tecnologia Funciona */}
        {/* <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-sm mb-16">
          <h2 className="text-2xl font-bold mb-6 text-center text-blue-800 dark:text-energy-blue-light">
            Como Nossa Tecnologia Funciona
          </h2>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="mx-auto bg-energy-blue-light/10 dark:bg-energy-blue-light/20 p-4 rounded-full w-16 h-16 flex items-center justify-center mb-4">
                <Zap className="h-8 w-8 text-energy-blue-light" />
              </div>
              <h3 className="font-bold mb-2 text-slate-900 dark:text-slate-100">
                1. Monitoramento
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Coleta dados sobre o consumo dos seus aparelhos elétricos.
              </p>
            </div>

            <div className="text-center">
              <div className="mx-auto bg-energy-blue-light/10 dark:bg-energy-blue-light/20 p-4 rounded-full w-16 h-16 flex items-center justify-center mb-4">
                <Brain className="h-8 w-8 text-energy-blue-light" />
              </div>
              <h3 className="font-bold mb-2 text-slate-900 dark:text-slate-100">
                2. Análise de IA
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                O sistema processa os dados e identifica padrões de consumo.
              </p>
            </div>

            <div className="text-center">
              <div className="mx-auto bg-energy-blue-light/10 dark:bg-energy-blue-light/20 p-4 rounded-full w-16 h-16 flex items-center justify-center mb-4">
                <BarChart3 className="h-8 w-8 text-energy-blue-light" />
              </div>
              <h3 className="font-bold mb-2 text-slate-900 dark:text-slate-100">
                3. Insights
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Gera recomendações inteligentes para otimizar o uso de energia.
              </p>
            </div>

            <div className="text-center">
              <div className="mx-auto bg-energy-blue-light/10 dark:bg-energy-blue-light/20 p-4 rounded-full w-16 h-16 flex items-center justify-center mb-4">
                <DollarSign className="h-8 w-8 text-energy-blue-light" />
              </div>
              <h3 className="font-bold mb-2 text-slate-900 dark:text-slate-100">
                4. Economia
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Você implementa as mudanças e reduz custos e impactos
                ambientais.
              </p>
            </div>
          </div>
        </div> */}

        {/* Para Quem é o WattStatus */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold mb-6 text-center text-blue-800 dark:text-energy-blue-light">
            Para Quem é o WattStatus
          </h2>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-lg border border-slate-200 dark:border-slate-700 hover:shadow-md transition-shadow">
              <div className="flex items-center mb-4">
                <div className="bg-blue-800/10 dark:bg-blue-800/20 p-3 rounded-full mr-4">
                  <Home className="h-6 w-6 text-blue-800" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  Usuários Residenciais
                </h3>
              </div>
              <p className="text-slate-600 dark:text-slate-300 mb-4">
                Para famílias que desejam reduzir gastos e adotar um estilo de
                vida mais sustentável.
              </p>
              <ul className="space-y-2">
                <li className="flex items-center text-sm">
                  <span className="mr-2 text-energy-green-light">✓</span>
                  <span className="text-slate-600 dark:text-slate-300">
                    Reduza sua conta em até 30%
                  </span>
                </li>
                <li className="flex items-center text-sm">
                  <span className="mr-2 text-energy-green-light">✓</span>
                  <span className="text-slate-600 dark:text-slate-300">
                    Evite hábitos de desperdício
                  </span>
                </li>
                <li className="flex items-center text-sm">
                  <span className="mr-2 text-energy-green-light">✓</span>
                  <span className="text-slate-600 dark:text-slate-300">
                    Monitore o consumo de cada aparelho
                  </span>
                </li>
              </ul>
            </div>

            <div className="bg-white dark:bg-slate-800 p-6 rounded-lg border border-slate-200 dark:border-slate-700 hover:shadow-md transition-shadow">
              <div className="flex items-center mb-4">
                <div className="bg-blue-800/10 dark:bg-blue-800/20 p-3 rounded-full mr-4">
                  <Building className="h-6 w-6 text-blue-800" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  Empresas
                </h3>
              </div>
              <p className="text-slate-600 dark:text-slate-300 mb-4">
                Para negócios que buscam otimizar custos operacionais e atingir
                metas de sustentabilidade.
              </p>
              <ul className="space-y-2">
                <li className="flex items-center text-sm">
                  <span className="mr-2 text-energy-green-light">✓</span>
                  <span className="text-slate-600 dark:text-slate-300">
                    Diminua gastos energéticos
                  </span>
                </li>
                <li className="flex items-center text-sm">
                  <span className="mr-2 text-energy-green-light">✓</span>
                  <span className="text-slate-600 dark:text-slate-300">
                    Centralize o monitoramento em uma única plataforma
                  </span>
                </li>
                <li className="flex items-center text-sm">
                  <span className="mr-2 text-energy-green-light">✓</span>
                  <span className="text-slate-600 dark:text-slate-300">
                    Reduza sua pegada de carbono
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Fontes e Referências */}
        <div className="bg-slate-100 dark:bg-slate-800 p-6 rounded-lg mb-16">
          <h3 className="font-bold mb-3 text-blue-800 dark:text-energy-blue-light">
            Fontes e Referências
          </h3>
          <ul className="text-sm text-slate-600 dark:text-slate-300 space-y-1">
            <li>• Empresa de Pesquisa Energética (EPE) – Relatório 2025</li>
            <li>
              • Agência Nacional de Energia Elétrica (ANEEL) – Projeção
              tarifária
            </li>
            <li>• Instituto de Sustentabilidade e Energia (ISE)</li>
            <li>
              • Painel Intergovernamental sobre Mudanças Climáticas (IPCC)
            </li>
          </ul>
        </div>
      </main>

      {/* Rodapé */}
      <Footer />
    </div>
  );
};

export default Sobre;
