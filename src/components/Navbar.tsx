import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AreaChart,
  Home,
  Info,
  Menu,
  X,
  LogOut,
  User,
  MoreVertical,
  Palette,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import Icon from "@/components/logo_wattstatus_icon.png";
import { useAuth } from "@/hooks/useAuth";

const Navbar = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { setTheme } = useTheme();
  const { user, logout } = useAuth();

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const handleLogout = async () => {
    await logout();
    navigate("/");
    setMobileMenuOpen(false);
  };

  return (
    <nav className="bg-energy-blue-dark dark:bg-energy-blue-dark  text-energy-800 dark:text-white fixed top-0 left-0 right-0 z-50 shadow-lg backdrop-blur-sm bg-opacity-95 dark:bg-opacity-95">
      <div className="container mx-auto px-4 py-3 flex justify-between items-center">
        <Link
          to="/"
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <div className="bg-energy-500 p-1.5 rounded-full">
            <img src={Icon} alt="Logo" className="h-6 w-6" />
          </div>
          <span className="font-bold text-xl text-energy-white dark:text-energy-50">
            WATTSTATUS
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-6">
          {user ? (
            <>
              <Link
                to="/dashboard"
                className="flex items-center gap-2 text-white hover:text-energy-800 dark:hover:text-energy-800 transition-colors duration-200"
              >
                <AreaChart className="h-5 w-5" />
                <span>Dashboard</span>
              </Link>
              <div className="flex items-center gap-3 ml-4 pl-4 border-l border-energy-blue-light">
                <div className="flex items-center gap-2 text-energy-100">
                  <User className="h-4 w-4" />
                  <span className="text-sm">
                    {user?.name || user?.email || "Usuario"}
                  </span>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-gray-600 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-950 p-1"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem
                      onClick={() => navigate("/")}
                      className="hover:bg-blue-100"
                    >
                      <Home className="w-4 h-4 mr-2 text-blue-600" />
                      Página Inicial
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <Palette className="w-4 h-4 mr-2 text-purple-600" />
                        Tema
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        <DropdownMenuItem onClick={() => setTheme("light")}>
                          Claro
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setTheme("dark")}>
                          Escuro
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setTheme("system")}>
                          Sistema
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout}>
                      <LogOut className="w-4 h-4 mr-2 text-red-600" />
                      Sair
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="text-energy-600 dark:text-energy-200 hover:text-energy-700 dark:hover:text-white transition-colors duration-200 font-medium"
              >
                Entrar
              </Link>
              <Link to="/signup">
                <Button
                  size="sm"
                  className="bg-energy-500 hover:bg-energy-600 text-white border-0"
                >
                  Criar conta
                </Button>
              </Link>
              <ThemeToggle />
            </>
          )}

          {/* <ThemeToggle /> */}
        </div>

        <div className="md:hidden">
          <Button
            variant="ghost"
            className="text-energy-800 dark:text-white hover:text-energy-600 dark:hover:text-energy-200 hover:bg-energy-100 dark:hover:bg-energy-blue-light/20"
            onClick={toggleMobileMenu}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </Button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden bg-energy-blue-dark/95 backdrop-blur-sm px-4 pb-4 space-y-3 border-t border-energy-blue-light/20">
          <Link
            to="/"
            className="flex items-center gap-2 hover:text-energy-200 transition-colors py-2"
            onClick={() => setMobileMenuOpen(false)}
          >
            <Home className="h-5 w-5" />
            <span>Início</span>
          </Link>

          {isLoggedIn ? (
            <>
              <Link
                to="/dashboard"
                className="flex items-center gap-2 hover:text-energy-200 transition-colors py-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                <AreaChart className="h-5 w-5" />
                <span>Dashboard</span>
              </Link>
              <div className="flex items-center justify-between py-2 border-t border-energy-blue-light/20 mt-2 pt-3">
                <div className="flex items-center gap-2 text-energy-100">
                  <User className="h-4 w-4" />
                  <span className="text-sm">{userName}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLogout}
                  className="text-energy-200 hover:text-white hover:bg-energy-blue-light/20"
                >
                  <LogOut className="h-4 w-4 mr-1" />
                  Sair
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-2 pt-2">
              <Link
                to="/login"
                className="block text-energy-200 hover:text-white transition-colors py-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                Entrar
              </Link>
              <Link to="/signup" onClick={() => setMobileMenuOpen(false)}>
                <Button
                  size="sm"
                  className="w-full bg-energy-500 hover:bg-energy-600 text-white border-0"
                >
                  Criar conta
                </Button>
              </Link>
            </div>
          )}

          <Link
            to="/sobre"
            className="flex items-center gap-2 hover:text-energy-200 transition-colors py-2"
            onClick={() => setMobileMenuOpen(false)}
          >
            <Info className="h-5 w-5" />
            <span>Sobre</span>
          </Link>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
