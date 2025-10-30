import React from "react";
import { Heart, Leaf, Mail, Phone, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import icon from "@/components/logo_wattstatus_icon.png";

const Footer = () => {
  return (
    <footer className="bg-gradient-to-r from-energy-blue-dark to-energy-800 dark:from-slate-900 dark:to-slate-800 text-white mt-auto">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand Section */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-energy-500 p-2 rounded-full">
                <img src={icon} alt="Logo" className="h-8 w-8" />
              </div>
              <h3 className="text-2xl font-bold text-energy-50 dark:text-energy-100">
                WATTSTATUS
              </h3>
            </div>
            <p className="text-energy-100 dark:text-energy-200 mb-6 max-w-md">
              Monitoramento inteligente para economia de energia. Nossa
              plataforma utiliza IA para analisar seu consumo, identificar
              anomalias e sugerir economias significativas para um futuro mais
              sustentável.
            </p>
            <div className="flex items-center gap-2 text-energy-200 dark:text-energy-300">
              <Heart className="h-5 w-5 text-energy-400" />
              <span className="text-sm">Feito com amor pelo planeta</span>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-lg font-semibold mb-4 text-energy-50 dark:text-energy-100">
              Links Rápidos
            </h4>
            <ul className="space-y-3">
              <li>
                <Link
                  to="/"
                  className="text-energy-200 dark:text-energy-300 hover:text-energy-50 dark:hover:text-energy-100 transition-colors duration-200"
                >
                  Início
                </Link>
              </li>
              <li>
                <Link
                  to="/sobre"
                  className="text-energy-200 dark:text-energy-300 hover:text-energy-50 dark:hover:text-energy-100 transition-colors duration-200"
                >
                  Sobre Nós
                </Link>
              </li>
              <li>
                <Link
                  to="/login"
                  className="text-energy-200 dark:text-energy-300 hover:text-energy-50 dark:hover:text-energy-100 transition-colors duration-200"
                >
                  Entrar
                </Link>
              </li>
              <li>
                <Link
                  to="/signup"
                  className="text-energy-200 dark:text-energy-300 hover:text-energy-50 dark:hover:text-energy-100 transition-colors duration-200"
                >
                  Criar Conta
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact & Social */}
          <div>
            <h4 className="text-lg font-semibold mb-4 text-energy-50 dark:text-energy-100">
              Contato
            </h4>
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-energy-200 dark:text-energy-300">
                <Mail className="h-4 w-4 text-energy-400" />
                <span className="text-sm">contato@wattstatus.com</span>
              </div>
              <div className="flex items-center gap-3 text-energy-200 dark:text-energy-300">
                <Phone className="h-4 w-4 text-energy-400" />
                <span className="text-sm">+55 (11) 9999-9999</span>
              </div>
              <div className="flex items-center gap-3 text-energy-200 dark:text-energy-300">
                <MapPin className="h-4 w-4 text-energy-400" />
                <span className="text-sm">São Paulo, Brasil</span>
              </div>
            </div>

            {/* Environmental Badge */}
            <div className="mt-6 p-3 bg-energy-500/20 dark:bg-energy-500/10 rounded-lg border border-energy-500/30 dark:border-energy-500/20">
              <div className="flex items-center gap-2 text-energy-100 dark:text-energy-200">
                <Leaf className="h-5 w-5 text-energy-400" />
                <span className="text-sm font-medium">Compromisso Verde</span>
              </div>
              <p className="text-xs text-energy-200 dark:text-energy-300 mt-1">
                Reduzindo emissões de CO₂ desde 2024
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-energy-blue-light/20 dark:border-slate-700 mt-8 pt-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-energy-300 dark:text-energy-400 text-sm">
              © {new Date().getFullYear()} WattStatus. Todos os direitos
              reservados.
            </p>
            <div className="flex gap-6 text-sm">
              <Link
                to="/privacidade"
                className="text-energy-300 dark:text-energy-400 hover:text-energy-50 dark:hover:text-energy-100 transition-colors"
              >
                Privacidade
              </Link>
              <Link
                to="/termos"
                className="text-energy-300 dark:text-energy-400 hover:text-energy-50 dark:hover:text-energy-100 transition-colors"
              >
                Termos
              </Link>
              <Link
                to="/suporte"
                className="text-energy-300 dark:text-energy-400 hover:text-energy-50 dark:hover:text-energy-100 transition-colors"
              >
                Suporte
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
