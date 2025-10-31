import React from "react";
import EnergySavingTip from "@/components/EnergySavingTip";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Lightbulb,
  DollarSign,
  Leaf,
  TrendingDown,
  Award,
  Target,
} from "lucide-react";

interface Tip {
  id: number;
  title: string;
  description: string;
  savingEstimate: string;
}

interface TipsTabProps {
  energySavingTips: Tip[];
}

const TipsTab: React.FC<TipsTabProps> = ({ energySavingTips }) => {
  const totalPotentialSavings = energySavingTips.reduce((total, tip) => {
    const match = tip.savingEstimate.match(/R\$ (\d+),(\d+)/);
    return total + (match ? parseFloat(match[1] + "." + match[2]) : 0);
  }, 0);

  return (
    <div className="space-y-8">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-2">
          Dicas de Economia
        </h2>
        <p className="text-gray-600 dark:text-gray-300">
          Descubra maneiras práticas de reduzir seu consumo de energia
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="p-6 hover:shadow-xl transition-all duration-300 border-l-4 border-l-energy-green-light">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-energy-green-light/10 dark:bg-energy-green-light/5 rounded-lg">
              <Lightbulb className="h-5 w-5 text-energy-600 dark:text-energy-green-light" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground dark:text-gray-400">
                Dicas Disponíveis
              </p>
              <p className="text-2xl font-bold text-energy-green-dark dark:text-energy-green-light">
                {energySavingTips.length}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6 hover:shadow-xl transition-all duration-300 border-l-4 border-l-energy-yellow">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-energy-yellow/10 dark:bg-energy-yellow/5 rounded-lg">
              <DollarSign className="h-5 w-5 text-energy-yellow dark:text-energy-yellow" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground dark:text-gray-400">
                Economia Potencial
              </p>
              <p className="text-2xl font-bold text-energy-yellow dark:text-energy-yellow">
                R$ {totalPotentialSavings.toFixed(2)}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6 hover:shadow-xl transition-all duration-300 border-l-4 border-l-energy-teal">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-energy-teal dark:bg-energy-teal rounded-lg">
              <Target className="h-5 w-5 text-energy-blue-dark dark:text-energy-blue-light" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground dark:text-gray-400">
                Implementadas
              </p>
              <p className="text-2xl font-bold text-energy-teal dark:text-energy-teal">
                0/3
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Tips Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {energySavingTips.map((tip, index) => (
          <EnergySavingTip
            key={tip.id}
            title={tip.title}
            description={tip.description}
            savingEstimate={tip.savingEstimate}
          />
        ))}
      </div>

      {/* Progress Section */}
      <Card className="p-6 hover:shadow-xl transition-all duration-300">
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <div className="p-2 bg-energy-green-light/10 dark:bg-energy-green-light/5 rounded-lg">
              <Award className="h-5 w-5 text-energy-green-dark dark:text-energy-green-light" />
            </div>
            Seu Progresso de Economia
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center p-4 bg-gradient-to-r from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-xl">
                <div className="text-3xl font-bold text-green-600 dark:text-green-400 mb-2">
                  0%
                </div>
                <div className="text-sm text-green-700 dark:text-green-300">
                  Dicas Implementadas
                </div>
                <div className="w-full bg-green-200 dark:bg-green-900/20 rounded-full h-2 mt-2">
                  <div
                    className="bg-green-500 dark:bg-green-400 h-2 rounded-full"
                    style={{ width: "0%" }}
                  ></div>
                </div>
              </div>

              <div className="text-center p-4 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-xl">
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-2">
                  R$ 0,00
                </div>
                <div className="text-sm text-blue-700 dark:text-blue-300">
                  Economia Realizada
                </div>
                <div className="w-full bg-blue-200 dark:bg-blue-900/20 rounded-full h-2 mt-2">
                  <div
                    className="bg-blue-500 dark:bg-blue-400 h-2 rounded-full"
                    style={{ width: "0%" }}
                  ></div>
                </div>
              </div>

              <div className="text-center p-4 bg-gradient-to-r from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-800/20 rounded-xl">
                <div className="text-3xl font-bold text-yellow-600 dark:text-yellow-400 mb-2">
                  ⭐
                </div>
                <div className="text-sm text-yellow-700 dark:text-yellow-300">
                  Nível Atual
                </div>
                <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                  Iniciante
                </div>
              </div>
            </div>

            <div className="p-4 bg-gradient-to-r from-energy-blue-light/10 to-energy-blue-dark/10 dark:from-energy-blue-light/5 dark:to-energy-blue-dark/5 rounded-xl">
              <h4 className="font-semibold text-energy-blue-dark dark:text-energy-blue-light mb-3">
                Próximos Passos:
              </h4>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-energy-blue-light dark:bg-energy-blue-light rounded-full flex items-center justify-center">
                    <span className="text-white text-xs font-bold">1</span>
                  </div>
                  <span className="text-energy-blue-dark dark:text-energy-blue-light">
                    Implemente a primeira dica de economia
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center">
                    <span className="text-gray-600 dark:text-gray-300 text-xs font-bold">
                      2
                    </span>
                  </div>
                  <span className="text-gray-600 dark:text-gray-300">
                    Monitore os resultados por 30 dias
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center">
                    <span className="text-gray-600 dark:text-gray-300 text-xs font-bold">
                      3
                    </span>
                  </div>
                  <span className="text-gray-600 dark:text-gray-300">
                    Alcance o nível intermediário
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Advanced Tips */}
      <Card className="p-6 hover:shadow-xl transition-all duration-300">
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <div className="p-2 bg-energy-green-light/10 dark:bg-energy-green-light/5 rounded-lg">
              <TrendingDown className="h-5 w-5 text-energy-green-dark dark:text-energy-green-light" />
            </div>
            Estratégias Avançadas de Economia
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="p-4 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-xl">
                <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">
                  🏠 Planejamento Doméstico
                </h4>
                <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                  <li>• Crie rotinas de economia energética</li>
                  <li>• Use aparelhos fora dos horários de ponta</li>
                  <li>• Implemente sistema de iluminação inteligente</li>
                  <li>• Monitore o consumo semanalmente</li>
                </ul>
              </div>

              <div className="p-4 bg-gradient-to-r from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-xl">
                <h4 className="font-semibold text-green-800 dark:text-green-200 mb-2">
                  🌱 Sustentabilidade
                </h4>
                <ul className="text-sm text-green-700 dark:text-green-300 space-y-1">
                  <li>• Considere energia solar residencial</li>
                  <li>• Use aparelhos com selo Procel A</li>
                  <li>• Recicle equipamentos antigos</li>
                  <li>• Participe de programas de eficiência</li>
                </ul>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-gradient-to-r from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-800/20 rounded-xl">
                <h4 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
                  💰 Benefícios Financeiros
                </h4>
                <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                  <li>• Reduza sua conta de luz em até 30%</li>
                  <li>• Economize R$ 200-500/mês em média</li>
                  <li>• Aumente o valor do seu imóvel</li>
                  <li>• Receba incentivos governamentais</li>
                </ul>
              </div>

              <div className="p-4 bg-gradient-to-r from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-xl">
                <h4 className="font-semibold text-purple-800 dark:text-purple-200 mb-2">
                  🌍 Impacto Ambiental
                </h4>
                <ul className="text-sm text-purple-700 dark:text-purple-300 space-y-1">
                  <li>• Reduza emissões de CO₂</li>
                  <li>• Preserve recursos naturais</li>
                  <li>• Contribua para o meio ambiente</li>
                  <li>• Incentive práticas sustentáveis</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TipsTab;
