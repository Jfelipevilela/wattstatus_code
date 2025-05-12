
import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Lightbulb, BarChart3, Cpu, DollarSign } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const Index = () => {
  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-white to-slate-50">
      <Navbar />
      
      <main className="flex-grow container mx-auto px-4 pt-20 pb-10">
        {/* Hero Section */}
        <section className="py-16 md:py-24">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-energy-blue-dark mb-6">
                Monitore e Economize Energia de Forma Inteligente
              </h1>
              <p className="text-lg text-slate-600 mb-8">
                Conheça o futuro do consumo consciente de energia. Nossa plataforma 
                utiliza inteligência artificial para analisar seu consumo, 
                identificar anomalias e sugerir economias significativas.
              </p>
              <div className="space-x-4">
                <Button 
                  size="lg" 
                  className="bg-energy-green-dark hover:bg-energy-green-light text-white"
                  asChild
                >
                  <Link to="/dashboard">Comece agora</Link>
                </Button>
                <Button 
                  size="lg" 
                  variant="outline" 
                  className="border-energy-blue-light text-energy-blue-light hover:bg-energy-blue-light/10"
                  asChild
                >
                  <Link to="/sobre">Saiba mais</Link>
                </Button>
              </div>
            </div>
            <div className="hidden md:flex justify-center">
              <img 
                src="https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?q=80&w=2340&auto=format&fit=crop&ixlib=rb-4.0.3" 
                alt="Energia Sustentável" 
                className="rounded-lg shadow-xl max-h-96 object-cover"
              />
            </div>
          </div>
        </section>
        
        {/* Features Section */}
        <section className="py-10">
          <h2 className="text-3xl font-bold text-center mb-10 text-energy-blue-dark">
            Como podemos ajudar
          </h2>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center">
                  <div className="bg-energy-blue-light/10 p-3 rounded-full mb-4">
                    <BarChart3 className="h-8 w-8 text-energy-blue-light" />
                  </div>
                  <h3 className="text-xl font-medium mb-2">Monitoramento em Tempo Real</h3>
                  <p className="text-slate-600">
                    Acompanhe o consumo de energia da sua casa ou empresa em tempo real, 
                    com análises detalhadas por período e dispositivo.
                  </p>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center">
                  <div className="bg-energy-green-light/10 p-3 rounded-full mb-4">
                    <Cpu className="h-8 w-8 text-energy-green-light" />
                  </div>
                  <h3 className="text-xl font-medium mb-2">Detecção de Anomalias com IA</h3>
                  <p className="text-slate-600">
                    Nossa inteligência artificial identifica comportamentos anormais 
                    nos seus eletrodomésticos antes que se tornem problemas graves.
                  </p>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center">
                  <div className="bg-energy-yellow/10 p-3 rounded-full mb-4">
                    <DollarSign className="h-8 w-8 text-energy-yellow" />
                  </div>
                  <h3 className="text-xl font-medium mb-2">Economia Comprovada</h3>
                  <p className="text-slate-600">
                    Receba insights personalizados para reduzir custos, com estimativas 
                    claras de economia para cada recomendação.
                  </p>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center">
                  <div className="bg-energy-red/10 p-3 rounded-full mb-4">
                    <Lightbulb className="h-8 w-8 text-energy-red" />
                  </div>
                  <h3 className="text-xl font-medium mb-2">Dicas Personalizadas</h3>
                  <p className="text-slate-600">
                    Receba sugestões adaptadas ao seu perfil de consumo para 
                    maximizar a eficiência energética.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
        
        {/* Call to Action */}
        <section className="py-16 bg-energy-blue-dark rounded-xl my-12 text-white">
          <div className="text-center px-4 md:px-16">
            <h2 className="text-3xl font-bold mb-4">Pronto para economizar energia e dinheiro?</h2>
            <p className="text-lg opacity-90 mb-8 max-w-2xl mx-auto">
              Junte-se a milhares de pessoas e empresas que já reduziram seus gastos 
              com energia e contribuem para um planeta mais sustentável.
            </p>
            <Button 
              size="lg" 
              className="bg-energy-green-light hover:bg-energy-green-dark"
              asChild
            >
              <Link to="/dashboard">Acessar Dashboard</Link>
            </Button>
          </div>
        </section>
      </main>
      
      <Footer />
    </div>
  );
};

export default Index;
