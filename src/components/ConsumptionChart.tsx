
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface ConsumptionChartProps {
  title: string;
  data: Array<{
    name: string;
    consumo: number;
    media: number;
  }>;
}

const ConsumptionChart: React.FC<ConsumptionChartProps> = ({ title, data }) => {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{
                top: 10,
                right: 30,
                left: 0,
                bottom: 0,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip 
                formatter={(value: number) => [`${value} kWh`, '']}
                labelFormatter={(label) => `${label}`}
              />
              <Legend />
              <Bar dataKey="consumo" name="Seu consumo" fill="#2196F3" radius={[4, 4, 0, 0]} />
              <Bar dataKey="media" name="Média regional" fill="#4CAF50" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export default ConsumptionChart;
