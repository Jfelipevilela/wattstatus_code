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
import {
  BarChart3,
  Calculator,
  Zap,
  Lightbulb,
  Home,
  User,
  LogOut,
  PlugZap,
  MoreVertical,
  Palette,
  FileText,
} from "lucide-react";
import { RiApps2AiLine } from "react-icons/ri";
import { Button } from "./ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useApps } from "@/hooks/useApps";
import { FaLaptopHouse } from "react-icons/fa";
import { BsFillHouseAddFill } from "react-icons/bs";
import { MdOutlineTipsAndUpdates } from "react-icons/md";
import { BiSolidReport } from "react-icons/bi";



const menuItems = [
  { title: "Dashboard", url: "/dashboard", icon: BarChart3 },
  { title: "Relatorios", url: "/relatorios", icon: BiSolidReport },
  { title: "Calculadora", url: "/calculadora", icon: BsFillHouseAddFill },
  { title: "Aparelhos", url: "/aparelhos", icon: FaLaptopHouse },
  { title: "Dicas", url: "/dicas", icon: MdOutlineTipsAndUpdates },
];

export function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setTheme } = useTheme();
  const { user, logout } = useAuth();
  const { apps } = useApps();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

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
          <SidebarGroupLabel className="text-energy-800 dark:text-white ">
            Navegacao
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    onClick={() => navigate(item.url)}
                    isActive={location.pathname === item.url}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2 text-base rounded-md transition-colors duration-200",
                      location.pathname === item.url
                        ? " text-energy-green-light font-semibold dark:bg-sidebar-accent border-l-4 border-l-energy-green-light  dark:text-energy-green-light font-semibold"
                        : "hover:bg-energy-200 dark:hover:bg-sidebar-accent text-black dark:text-sidebar-accent-foreground"
                    )}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarSeparator />
        <SidebarGroup>
          <SidebarGroupLabel className="text-energy-800 dark:text-white ">
            Apps
          </SidebarGroupLabel>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => navigate("/apps")}
              isActive={location.pathname === "/apps"}
              className={cn(
                "flex items-center gap-3  py-2 text-base rounded-md transition-colors duration-200",
                location.pathname === "/apps"
                  ? " text-energy-green-light font-semibold dark:bg-sidebar-accent border-l-4 border-l-energy-green-light  dark:text-energy-green-light font-semibold"
                  : "hover:bg-energy-200 dark:hover:bg-sidebar-accent text-black dark:text-sidebar-accent-foreground"
              )}
            >
              <RiApps2AiLine />
              <span>Biblioteca de apps</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarGroupContent>
            <SidebarMenu>
              {apps.map((app) => (
                <SidebarMenuItem key={app.url}>
                  <SidebarMenuButton
                    onClick={() => navigate(app.url)}
                    isActive={location.pathname === app.url}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2 text-base rounded-md transition-colors duration-200",
                      location.pathname === app.url
                        ? " text-energy-green-light font-semibold dark:bg-sidebar-accent border-l-4 border-l-energy-green-light  dark:text-energy-green-light font-semibold"
                        : "hover:bg-energy-200 dark:hover:bg-sidebar-accent text-black dark:text-sidebar-accent-foreground"
                    )}
                  >
                    {app.icon}
                    <span>{app.name}</span>
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
          <div className="flex items-center gap-3 px-2 py-2 rounded-md bg-energy-100 dark:bg-sidebar-accent">
            <div className="w-8 h-8 bg-energy-blue-light rounded-full flex items-center justify-center">
              <User className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-energy-800 dark:text-sidebar-accent-foreground truncate">
                {user?.name || "Usuario"}
              </p>
              <p className="text-xs text-energy-600 dark:text-sidebar-accent-foreground/70 truncate">
                {user?.email || "usuario@email.com"}
              </p>
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
                  Pagina Inicial
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
                  <LogOut className="w-4 h-4 mr-2 text-red-600 " />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </SidebarFooter>
    </ShadcnSidebar>
  );
}

export { SidebarProvider, SidebarTrigger };
