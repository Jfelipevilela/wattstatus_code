
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lightbulb } from 'lucide-react';

interface EnergySavingTipProps {
  title: string;
  description: string;
  savingEstimate?: string;
}

const EnergySavingTip: React.FC<EnergySavingTipProps> = ({
  title,
  description,
  savingEstimate,
}) => {
  return (
    <Card className="h-full border-l-4 border-l-energy-green-light">
      <CardHeader className="flex flex-row items-center gap-2 pb-2">
        <Lightbulb className="h-5 w-5 text-energy-green-light" />
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-2">{description}</p>
        {savingEstimate && (
          <p className="text-sm font-medium text-energy-green-dark">
            Economia estimada: {savingEstimate}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default EnergySavingTip;
