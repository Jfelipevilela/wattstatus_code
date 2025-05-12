
import React from 'react';
import { Heart } from 'lucide-react';

const Footer = () => {
  return (
    <footer className="bg-energy-blue-dark text-white py-6 mt-auto">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="mb-4 md:mb-0">
            <h3 className="text-lg font-semibold">WattStatus</h3>
            <p className="text-sm opacity-75 mt-1">Calculadora inteligente para economia de energia</p>
          </div>
          
          <div className="flex flex-col items-center md:items-end">
            <p className="text-sm opacity-75">
              © {new Date().getFullYear()} WattStatus. Todos os direitos reservados.
            </p>
            <p className="text-sm flex items-center mt-1">
              Feito com <Heart className="h-4 w-4 mx-1 text-energy-green-light" /> para o planeta
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
