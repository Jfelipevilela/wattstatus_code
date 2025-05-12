
import React, { useState } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import ConsumptionCard from '@/components/ConsumptionCard';
import ConsumptionChart from '@/components/ConsumptionChart';
import ApplianceCard from '@/components/ApplianceCard';
import AnomalyDetection from '@/components/AnomalyDetection';
import EnergySavingTip from '@/components/EnergySavingTip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Zap, DollarSign, Calendar, Leaf } from 'lucide-react';

// Dados de exemplo para o dashboard
const consumptionData = [
  { name: 'Jan', consumo: 220, media: 250 },
  { name: 'Fev', consumo: 235, media: 248 },
  { name: 'Mar', consumo: 267, media: 245 },
  { name: 'Abr', consumo: 244, media: 246 },
  { name: 'Mai', consumo: 230, media: 247 },
  { name: 'Jun', consumo: 226, media: 243 },
];

const appliances = [
  { 
    id: 1, 
    name: 'Ar Condicionado', 
    power: 1400, 
    status: 'critical' as const, 
    usageHours: 6, 
    monthlyCost: 156.8 
  },
  { 
    id: 2, 
    name: 'Geladeira', 
    power: 200, 
    status: 'normal' as const, 
    usageHours: 24, 
    monthlyCost: 89.6 
  },
  { 
    id: 3, 
    name: 'Chuveiro Elétrico', 
    power: 5500, 
    status: 'warning' as const, 
    usageHours: 0.5, 
    monthlyCost: 51.3 
  },
  { 
    id: 4, 
    name: 'Máquina de Lavar', 
    power: 500, 
    status: 'normal' as const, 
    usageHours: 1.5, 
    monthlyCost: 14.0 
  },
  { 
    id: 5, 
    name: 'Computador', 
    power: 300, 
    status: 'normal' as const, 
    usageHours: 8, 
    monthlyCost: 44.8 
  },
];

const anomalies = [
  {
    id: 1,
    deviceName: 'Ar Condicionado',
    anomalyScore: 85,
    description: 'Consumo 45% acima do padrão normal para este dispositivo. Possível obstrução de filtro ou problema no compressor.',
    recommendation: 'Verifique e limpe os filtros. Se o problema persistir, considere uma manutenção preventiva.'
  },
  {
    id: 2,
    deviceName: 'Chuveiro Elétrico',
    anomalyScore: 65,
    description: 'Consumo flutuante detectado, possivelmente relacionado a problemas na resistência elétrica.',
    recommendation: 'Monitore o uso por mais uma semana. Se o padrão continuar, considere a substituição da resistência.'
  }
];

const energySavingTips = [
  {
    id: 1,
    title: 'Otimize o uso do ar condicionado',
    description: 'Manter a temperatura em 23°C pode reduzir significativamente o consumo sem afetar o conforto.',
    savingEstimate: 'Até R$ 45,00/mês'
  },
  {
    id: 2,
    title: 'Substitua lâmpadas por LED',
    description: 'Lâmpadas LED usam até 85% menos energia que as incandescentes e duram muito mais.',
    savingEstimate: 'Até R$ 20,00/mês'
  },
  {
    id: 3,
    title: 'Desligue dispositivos em standby',
    description: 'Aparelhos em modo de espera podem representar até 10% do consumo residencial.',
    savingEstimate: 'Até R$ 30,00/mês'
  }
];

const Dashboard = () => {
  const [period, setPeriod] = useState('mensal');
  
  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <Navbar />
      
      <main className="flex-grow container mx-auto px-4 pt-24 pb-10">
        <h1 className="text-3xl font-bold mb-6 text-energy-blue-dark">Dashboard de Energia</h1>
        
        <Tabs defaultValue="consumo" className="mb-8">
          <TabsList className="grid grid-cols-4 mb-8">
            <TabsTrigger value="consumo">Consumo</TabsTrigger>
            <TabsTrigger value="aparelhos">Aparelhos</TabsTrigger>
            <TabsTrigger value="anomalias">Anomalias</TabsTrigger>
            <TabsTrigger value="dicas">Dicas de Economia</TabsTrigger>
          </TabsList>
          
          <TabsContent value="consumo" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <ConsumptionCard 
                title="Consumo Atual" 
                value="238"
                unit="kWh/mês"
                trend="down"
                percentage={5}
                icon={<Zap className="h-5 w-5 text-energy-blue-light" />}
              />
              
              <ConsumptionCard 
                title="Gasto Estimado" 
                value="R$ 356,42"
                unit="no mês"
                trend="down"
                percentage={5}
                icon={<DollarSign className="h-5 w-5 text-energy-green-light" />}
              />
              
              <ConsumptionCard 
                title="Média Diária" 
                value="7,9"
                unit="kWh/dia"
                trend="up"
                percentage={2}
                icon={<Calendar className="h-5 w-5 text-energy-yellow" />}
              />
              
              <ConsumptionCard 
                title="Impacto Ambiental" 
                value="102"
                unit="kg CO₂"
                trend="down"
                percentage={8}
                icon={<Leaf className="h-5 w-5 text-energy-green-dark" />}
              />
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ConsumptionChart
                title="Consumo Mensal (kWh)"
                data={consumptionData}
              />
              
              <div className="bg-white p-6 rounded-lg shadow-sm">
                <h3 className="text-xl font-semibold mb-4">Análise de Consumo</h3>
                <p className="text-slate-600 mb-4">
                  Seu consumo está <span className="text-energy-green-dark font-medium">5% abaixo</span> da média 
                  para residências do seu perfil em sua região. Continue economizando!
                </p>
                
                <h4 className="font-medium mb-2">Distribuição por Categoria:</h4>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm">Climatização</span>
                      <span className="text-sm">38%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full">
                      <div className="h-2 bg-energy-blue-light rounded-full" style={{ width: '38%' }}></div>
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm">Refrigeração</span>
                      <span className="text-sm">22%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full">
                      <div className="h-2 bg-energy-green-light rounded-full" style={{ width: '22%' }}></div>
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm">Aquecimento de Água</span>
                      <span className="text-sm">18%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full">
                      <div className="h-2 bg-energy-yellow rounded-full" style={{ width: '18%' }}></div>
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm">Iluminação</span>
                      <span className="text-sm">12%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full">
                      <div className="h-2 bg-energy-red rounded-full" style={{ width: '12%' }}></div>
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm">Outros</span>
                      <span className="text-sm">10%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full">
                      <div className="h-2 bg-slate-500 rounded-full" style={{ width: '10%' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="aparelhos" className="space-y-6">
            <h2 className="text-2xl font-bold mb-4">Seus Aparelhos</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {appliances.map(appliance => (
                <ApplianceCard 
                  key={appliance.id}
                  name={appliance.name}
                  power={appliance.power}
                  status={appliance.status}
                  usageHours={appliance.usageHours}
                  monthlyCost={appliance.monthlyCost}
                />
              ))}
            </div>
          </TabsContent>
          
          <TabsContent value="anomalias" className="space-y-6">
            <h2 className="text-2xl font-bold mb-4">Detecção de Anomalias por IA</h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {anomalies.map(anomaly => (
                <AnomalyDetection 
                  key={anomaly.id}
                  deviceName={anomaly.deviceName}
                  anomalyScore={anomaly.anomalyScore}
                  description={anomaly.description}
                  recommendation={anomaly.recommendation}
                />
              ))}
            </div>
            
            <div className="bg-slate-100 p-6 rounded-lg border border-slate-200 mt-4">
              <h3 className="text-lg font-medium mb-2 flex items-center">
                <Cpu className="h-5 w-5 text-energy-blue-light mr-2" />
                Como funciona nossa IA
              </h3>
              <p className="text-slate-600 text-sm">
                Nossa tecnologia de Inteligência Artificial monitora continuamente o padrão de consumo de seus 
                eletrodomésticos. Quando um dispositivo começa a comportar-se de forma anormal, nosso sistema 
                detecta essa anomalia e sugere ações preventivas. Isso ajuda a evitar problemas maiores, 
                economizar energia e prolongar a vida útil dos aparelhos.
              </p>
            </div>
          </TabsContent>
          
          <TabsContent value="dicas" className="space-y-6">
            <h2 className="text-2xl font-bold mb-4">Dicas para Economizar Energia</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {energySavingTips.map(tip => (
                <EnergySavingTip 
                  key={tip.id}
                  title={tip.title}
                  description={tip.description}
                  savingEstimate={tip.savingEstimate}
                />
              ))}
            </div>
            
            <div className="bg-energy-blue-dark text-white p-6 rounded-lg mt-4">
              <h3 className="text-lg font-medium mb-2 flex items-center">
                <Lightbulb className="h-5 w-5 text-energy-yellow mr-2" />
                Economia Total Possível
              </h3>
              <p className="text-white/90 mb-4">
                Seguindo todas as nossas recomendações personalizadas, você pode economizar aproximadamente 
                <span className="font-bold text-white ml-1">R$ 95,00 por mês</span>, 
                o que representa <span className="font-bold text-white">25%</span> da sua conta atual.
              </p>
              <div className="h-2 bg-white/20 rounded-full">
                <div className="h-2 bg-energy-green-light rounded-full" style={{ width: '25%' }}></div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
      
      <Footer />
    </div>
  );
};

export default Dashboard;
