
import React from "react";
import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center px-4">
        <h1 className="text-8xl font-bold text-energy-blue-dark mb-4">404</h1>
        <p className="text-2xl text-slate-600 mb-6">Oops! Página não encontrada</p>
        <p className="text-slate-500 mb-8 max-w-md mx-auto">
          A página que você está procurando pode ter sido removida, renomeada ou 
          está temporariamente indisponível.
        </p>
        <Button asChild className="bg-energy-blue-dark hover:bg-energy-blue-light">
          <Link to="/" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Voltar para a página inicial
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
