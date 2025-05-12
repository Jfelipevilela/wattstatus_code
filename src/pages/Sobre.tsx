
import React from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Zap, Cpu, BarChart3, Leaf, Users, Building, DollarSign, Brain } from 'lucide-react';

const Sobre = () => {
  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <Navbar />
      
      <main className="flex-grow container mx-auto px-4 pt-24 pb-10">
        <h1 className="text-4xl font-bold mb-2 text-energy-blue-dark">Sobre o EnergyWatch</h1>
        <p className="text-lg text-slate-600 mb-10">Monitoramento inteligente para economia de energia</p>
        
        <div className="grid md:grid-cols-2 gap-10 mb-16">
          <div>
            <h2 className="text-2xl font-bold mb-4 text-energy-blue-dark">Nossa Missão</h2>
            <p className="text-slate-600 mb-6">
              Criamos o EnergyWatch com uma missão clara: tornar o consumo de energia mais 
              eficiente, econômico e sustentável para todos. Acreditamos que a tecnologia pode 
              ajudar pessoas e empresas a tomarem decisões mais inteligentes sobre seu consumo 
              energético, gerando economia financeira e contribuindo para um planeta mais saudável.
            </p>
            <p className="text-slate-600 mb-6">
              Nossa plataforma combina monitoramento preciso do consumo com análises avançadas 
              de IA para identificar padrões, detectar anomalias e fornecer recomendações 
              personalizadas que realmente fazem diferença.
            </p>
            
            <h2 className="text-2xl font-bold mb-4 text-energy-blue-dark mt-8">Benefícios</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-start">
                <div className="mt-1 mr-2 bg-energy-green-light/10 p-2 rounded-full">
                  <DollarSign className="h-4 w-4 text-energy-green-light" />
                </div>
                <div>
                  <h3 className="font-medium mb-1">Economia</h3>
                  <p className="text-sm text-slate-600">Reduza sua conta de energia em até 30%</p>
                </div>
              </div>
              
              <div className="flex items-start">
                <div className="mt-1 mr-2 bg-energy-blue-light/10 p-2 rounded-full">
                  <Cpu className="h-4 w-4 text-energy-blue-light" />
                </div>
                <div>
                  <h3 className="font-medium mb-1">Prevenção</h3>
                  <p className="text-sm text-slate-600">Evite falhas em eletrodomésticos</p>
                </div>
              </div>
              
              <div className="flex items-start">
                <div className="mt-1 mr-2 bg-energy-yellow/10 p-2 rounded-full">
                  <BarChart3 className="h-4 w-4 text-energy-yellow" />
                </div>
                <div>
                  <h3 className="font-medium mb-1">Visibilidade</h3>
                  <p className="text-sm text-slate-600">Entenda seu consumo em detalhes</p>
                </div>
              </div>
              
              <div className="flex items-start">
                <div className="mt-1 mr-2 bg-energy-green-dark/10 p-2 rounded-full">
                  <Leaf className="h-4 w-4 text-energy-green-dark" />
                </div>
                <div>
                  <h3 className="font-medium mb-1">Sustentabilidade</h3>
                  <p className="text-sm text-slate-600">Reduza sua pegada de carbono</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="relative">
            <img 
              src="https://images.unsplash.com/photo-1548266652-99cf27f51d73?q=80&w=2340&auto=format&fit=crop"
              alt="Energia sustentável"
              className="rounded-lg shadow-lg w-full h-auto object-cover"
            />
            <div className="absolute bottom-4 left-4 bg-white/90 p-4 rounded-md shadow-sm">
              <p className="text-sm font-medium text-energy-blue-dark">
                Reduza seu impacto ambiental economizando energia de forma inteligente.
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-8 rounded-xl shadow-sm mb-16">
          <h2 className="text-2xl font-bold mb-6 text-center text-energy-blue-dark">Como Nossa Tecnologia Funciona</h2>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="mx-auto bg-energy-blue-light/10 p-4 rounded-full w-16 h-16 flex items-center justify-center mb-4">
                <Zap className="h-8 w-8 text-energy-blue-light" />
              </div>
              <h3 className="font-bold mb-2">1. Monitoramento</h3>
              <p className="text-sm text-slate-600">
                Coletamos dados sobre o consumo de energia dos aparelhos elétricos.
              </p>
            </div>
            
            <div className="text-center">
              <div className="mx-auto bg-energy-blue-light/10 p-4 rounded-full w-16 h-16 flex items-center justify-center mb-4">
                <Brain className="h-8 w-8 text-energy-blue-light" />
              </div>
              <h3 className="font-bold mb-2">2. Análise de IA</h3>
              <p className="text-sm text-slate-600">
                Nossa IA processa os dados para identificar padrões e anomalias.
              </p>
            </div>
            
            <div className="text-center">
              <div className="mx-auto bg-energy-blue-light/10 p-4 rounded-full w-16 h-16 flex items-center justify-center mb-4">
                <BarChart3 className="h-8 w-8 text-energy-blue-light" />
              </div>
              <h3 className="font-bold mb-2">3. Insights</h3>
              <p className="text-sm text-slate-600">
                Geramos recomendações personalizadas baseadas nas análises.
              </p>
            </div>
            
            <div className="text-center">
              <div className="mx-auto bg-energy-blue-light/10 p-4 rounded-full w-16 h-16 flex items-center justify-center mb-4">
                <DollarSign className="h-8 w-8 text-energy-blue-light" />
              </div>
              <h3 className="font-bold mb-2">4. Economia</h3>
              <p className="text-sm text-slate-600">
                Você implementa as mudanças e acompanha as economias geradas.
              </p>
            </div>
          </div>
        </div>
        
        <div className="mb-16">
          <h2 className="text-2xl font-bold mb-6 text-center text-energy-blue-dark">Para Quem é o EnergyWatch</h2>
          
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-white p-6 rounded-lg border border-slate-200">
              <div className="flex items-center mb-4">
                <div className="bg-energy-blue-dark/10 p-3 rounded-full mr-4">
                  <Users className="h-6 w-6 text-energy-blue-dark" />
                </div>
                <h3 className="text-xl font-bold">Usuários Residenciais</h3>
              </div>
              <p className="text-slate-600 mb-4">
                Para famílias que desejam reduzir gastos mensais com energia e 
                adotar um estilo de vida mais sustentável. Nosso sistema ajuda a 
                identificar eletrodomésticos ineficientes e hábitos que geram 
                desperdício.
              </p>
              <ul className="space-y-2">
                <li className="flex items-center text-sm">
                  <span className="mr-2 text-energy-green-light">✓</span>
                  Reduza sua conta de energia em até 30%
                </li>
                <li className="flex items-center text-sm">
                  <span className="mr-2 text-energy-green-light">✓</span>
                  Evite falhas em eletrodomésticos
                </li>
                <li className="flex items-center text-sm">
                  <span className="mr-2 text-energy-green-light">✓</span>
                  Receba dicas personalizadas
                </li>
                <li className="flex items-center text-sm">
                  <span className="mr-2 text-energy-green-light">✓</span>
                  Monitore o consumo de cada aparelho
                </li>
              </ul>
            </div>
            
            <div className="bg-white p-6 rounded-lg border border-slate-200">
              <div className="flex items-center mb-4">
                <div className="bg-energy-blue-dark/10 p-3 rounded-full mr-4">
                  <Building className="h-6 w-6 text-energy-blue-dark" />
                </div>
                <h3 className="text-xl font-bold">Empresas</h3>
              </div>
              <p className="text-slate-600 mb-4">
                Para negócios que buscam reduzir custos operacionais e cumprir 
                metas de sustentabilidade. Nossa plataforma oferece análises 
                detalhadas e soluções escaláveis para empresas de todos os portes.
              </p>
              <ul className="space-y-2">
                <li className="flex items-center text-sm">
                  <span className="mr-2 text-energy-green-light">✓</span>
                  Otimize o gasto energético operacional
                </li>
                <li className="flex items-center text-sm">
                  <span className="mr-2 text-energy-green-light">✓</span>
                  Monitore múltiplos locais em uma única plataforma
                </li>
                <li className="flex items-center text-sm">
                  <span className="mr-2 text-energy-green-light">✓</span>
                  Identifique equipamentos ineficientes
                </li>
                <li className="flex items-center text-sm">
                  <span className="mr-2 text-energy-green-light">✓</span>
                  Reduza sua pegada de carbono
                </li>
              </ul>
            </div>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
};

export default Sobre;
