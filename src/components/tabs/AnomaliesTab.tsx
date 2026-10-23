import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const AnomaliesTab = () => (
  <Card>
    <CardHeader>
      <CardTitle>Anomalias</CardTitle>
    </CardHeader>
    <CardContent>
      <p>Nenhuma análise de anomalias está disponível.</p>
      <p className="mt-2 text-sm text-muted-foreground">
        O sistema ainda não coleta histórico medido suficiente para detectar desvios.
        Estimativas e tempo ligado não são medições de consumo.
      </p>
    </CardContent>
  </Card>
);

export default AnomaliesTab;
