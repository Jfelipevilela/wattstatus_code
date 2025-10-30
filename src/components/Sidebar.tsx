import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  BarChart3,
  TrendingUp,
  Calculator,
  Zap,
  AlertTriangle,
  Lightbulb,
  Home,
  User,
  LogOut,
  PlugZap,
  House,
} from "lucide-react";
import { Button } from "./ui/button";

const menuItems = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: BarChart3,
  },

  {
    title: "Indicadores",
    url: "/indicadores",
    icon: TrendingUp,
  },
  {
    title: "Calculadora",
    url: "/calculadora",
    icon: Calculator,
  },
  {
    title: "Aparelhos",
    url: "/aparelhos",
    icon: PlugZap,
  },
  // {
  //   title: "Anomalias",
  //   url: "/anomalias",
  //   icon: AlertTriangle,
  // },
  {
    title: "Dicas",
    url: "/dicas",
    icon: Lightbulb,
  },
];

export function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    localStorage.removeItem("wattstatus_user");
    navigate("/login");
  };

  // Get user data from localStorage
  const userData = localStorage.getItem("wattstatus_user");
  const user = userData ? JSON.parse(userData) : null;

  return (
    <ShadcnSidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-4 py-2">
          <div className="w-8 h-8 bg-energy-green-light rounded-lg flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg text-energy-800 dark:text-white">
            WattStatus
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-energy-800 dark:text-white">
            Navegação
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    onClick={() => navigate(item.url)}
                    isActive={location.pathname === item.url}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarSeparator />
        <div className="p-2">
          {/* User Info */}

          <div className="flex items-center gap-3 px-2 py-2 rounded-md bg-energy-100 dark:bg-sidebar-accent">
            <div className="w-8 h-8 bg-energy-blue-light rounded-full flex items-center justify-center">
              <User className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-energy-800 dark:text-sidebar-accent-foreground truncate">
                {user?.name || "Usuário"}
              </p>
              <p className="text-xs text-energy-600 dark:text-sidebar-accent-foreground/70 truncate">
                {user?.email || "usuario@email.com"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950 p-1"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>

          {/* Home Button and Theme Toggle aligned to right */}
          <div className="flex items-center justify-end gap-2 mt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/")}
              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950"
            >
              <House className="w-4 h-4" />
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </SidebarFooter>
    </ShadcnSidebar>
  );
}

export { SidebarProvider, SidebarTrigger };
