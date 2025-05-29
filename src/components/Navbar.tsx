
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Lightbulb, AreaChart, Home, Settings, Info, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Icon from '@/components/logo_wattstatus_icon.png';

const Navbar = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  return (
    <nav className="bg-energy-blue-dark text-white fixed top-0 left-0 right-0 z-50 shadow-md">
      <div className="container mx-auto px-4 py-3 flex justify-between items-center">
        <Link to="/" className="flex items-center gap-2">
          {/* <Lightbulb className="h-6 w-6 text-energy-yellow" /> */}
          <img src={Icon} alt="Logo" className="h-8 w-8" />
          {/* <span className="text-energy-yellow text-xl font-bold">WATTSTATUS</span> */}
          <span className="font-bold text-xl">WATTSTATUS</span>
        </Link>

        <div className="hidden md:flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2 hover:text-energy-yellow transition-colors">
            <Home className="h-5 w-5" />
            <span>Início</span>
          </Link>
          <Link to="/dashboard" className="flex items-center gap-2 hover:text-energy-yellow transition-colors">
            <AreaChart className="h-5 w-5" />
            <span>Dashboard</span>
          </Link>
          {/* <Link to="/configuracoes" className="flex items-center gap-2 hover:text-energy-yellow transition-colors">
            <Settings className="h-5 w-5" />
            <span>Configurações</span>
          </Link> */}
          <Link to="/sobre" className="flex items-center gap-2 hover:text-energy-yellow transition-colors">
            <Info className="h-5 w-5" />
            <span>Sobre</span>
          </Link>
        </div>

        <div className="md:hidden">
          <Button variant="ghost" className="text-white hover:text-energy-yellow" onClick={toggleMobileMenu} aria-label="Toggle menu">
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden bg-energy-blue-dark px-4 pb-4 space-y-2">
          <Link to="/" className="flex items-center gap-2 hover:text-energy-yellow transition-colors" onClick={() => setMobileMenuOpen(false)}>
            <Home className="h-5 w-5" />
            <span>Início</span>
          </Link>
          <Link to="/dashboard" className="flex items-center gap-2 hover:text-energy-yellow transition-colors" onClick={() => setMobileMenuOpen(false)}>
            <AreaChart className="h-5 w-5" />
            <span>Dashboard</span>
          </Link>
          {/* <Link to="/configuracoes" className="flex items-center gap-2 hover:text-energy-yellow transition-colors" onClick={() => setMobileMenuOpen(false)}>
            <Settings className="h-5 w-5" />
            <span>Configurações</span>
          </Link> */}
          <Link to="/sobre" className="flex items-center gap-2 hover:text-energy-yellow transition-colors" onClick={() => setMobileMenuOpen(false)}>
            <Info className="h-5 w-5" />
            <span>Sobre</span>
          </Link>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
