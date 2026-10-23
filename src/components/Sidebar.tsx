import React from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LayoutDashboard,
  FileBarChart,
  Calculator,
  Plug,
  Lightbulb,
  Zap,
  Home,
  LogOut,
  ChevronsUpDown,
  Sun,
  Moon,
  Monitor,
  Plus,
  Settings2,
  ArrowRight,
  ChevronRight,
  Info,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useApps } from "@/hooks/useApps";

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
}

const menuItems: NavItem[] = [
  { title: "Visão geral", url: "/dashboard", icon: LayoutDashboard },
  { title: "Relatórios", url: "/relatorios", icon: FileBarChart },
  { title: "Calculadora", url: "/calculadora", icon: Calculator },
  { title: "Aparelhos", url: "/aparelhos", icon: Plug },
  { title: "Dicas", url: "/dicas", icon: Lightbulb },
];

// Cor de marca usada no ícone de cada integração.
const APP_BRAND_COLORS: Record<string, string> = {
  smartthings: "#15BFFF",
  "lg-thinq": "#A50034",
};

const themeOptions = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
] as const;

// Visual compartilhado por todos os links de navegação. A sidebar é sempre
// escura, então o item ativo usa verde sólido para máximo contraste.
const navButtonClass = (active: boolean) =>
  cn(
    "h-10 gap-3 rounded-lg px-3 text-sm font-medium transition-all duration-200",
    "text-slate-600 dark:text-white/60 hover:bg-slate-900/[0.06] dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white",
    "[&>svg]:size-[18px] [&>svg]:shrink-0",
    active &&
      cn(
        "bg-energy-green-light text-energy-blue-dark font-semibold shadow-lg shadow-energy-green-light/25",
        "hover:bg-energy-green-light hover:text-energy-blue-dark",
        "data-[active=true]:bg-energy-green-light data-[active=true]:text-energy-blue-dark"
      )
  );

const groupLabelClass =
  "px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-white/35";

function getInitials(name?: string | null) {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "U";
}

export function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const { apps, available } = useApps();
  const { isMobile, setOpenMobile } = useSidebar();

  const isActive = (url: string) =>
    location.pathname === url || location.pathname.startsWith(`${url}/`);

  // No mobile a sidebar é um drawer: fecha ao navegar.
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  const handleLogout = async () => {
    if (!await logout()) return;
    navigate("/login");
  };

  return (
    <ShadcnSidebar
      collapsible="icon"
      className="border-r border-slate-200 dark:border-white/[0.06] group-data-[collapsible=icon]:[&_[data-sidebar=menu-item]]:flex group-data-[collapsible=icon]:[&_[data-sidebar=menu-item]]:justify-center group-data-[collapsible=icon]:[&_[data-sidebar=menu-button]]:!size-10 group-data-[collapsible=icon]:[&_[data-sidebar=menu-button]]:!p-0 group-data-[collapsible=icon]:[&_[data-sidebar=menu-button]]:justify-center group-data-[collapsible=icon]:[&_[data-sidebar=menu-button]>*:not(:first-child)]:hidden text-slate-900 dark:text-white [&_[data-sidebar=sidebar]]:bg-white dark:[&_[data-sidebar=sidebar]]:bg-energy-blue-dark [&_[data-sidebar=sidebar]]:bg-[radial-gradient(120%_60%_at_0%_0%,rgba(0,200,83,0.10),transparent_60%)]"
    >
      <SidebarHeader className="py-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              size="lg"
              tooltip="WattStatus"
              className="hover:bg-transparent active:bg-transparent"
            >
              <Link to="/dashboard" onClick={closeOnMobile}>
                <div className="flex aspect-square size-9 items-center justify-center rounded-xl bg-gradient-to-br from-energy-green-light to-emerald-600 shadow-lg shadow-energy-green-light/40 ring-1 ring-white/10">
                  <Zap className="size-5 fill-white text-white" />
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-base font-bold tracking-tight text-slate-900 dark:text-white">
                    WattStatus
                  </span>
                  <span className="truncate text-xs text-slate-500 dark:text-white/45">
                    Gestão de energia
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-1 px-1">
        <SidebarGroup>
          <SidebarGroupLabel className={groupLabelClass}>Navegação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {menuItems.map((item) => {
                const active = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.title}
                      className={navButtonClass(active)}
                    >
                      <Link
                        to={item.url}
                        onClick={closeOnMobile}
                        aria-current={active ? "page" : undefined}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-2">
          <SidebarGroupLabel className={cn(groupLabelClass, "gap-2")}>
            Integrações
            {apps.length > 0 && (
              <span className="rounded-full bg-energy-green-light/15 px-1.5 py-px text-[10px] font-bold tracking-normal text-energy-green-light">
                {apps.length}
              </span>
            )}
          </SidebarGroupLabel>
          <SidebarGroupAction
            asChild
            title="Gerenciar integrações"
            className="text-slate-400 dark:text-white/40 hover:bg-slate-900/[0.08] dark:hover:bg-white/[0.08] hover:text-energy-green-light"
          >
            <Link to="/apps" onClick={closeOnMobile} aria-label="Gerenciar integrações">
              <Settings2 />
            </Link>
          </SidebarGroupAction>
          <SidebarGroupContent>
            {apps.length === 0 ? (
              <>
                {/* Estado vazio: convite para conectar o primeiro app. */}
                <Link
                  to="/apps"
                  onClick={closeOnMobile}
                  className="group/empty mx-1 mt-1 block rounded-xl border border-slate-900/[0.08] dark:border-white/[0.08] bg-gradient-to-br from-energy-green-light/[0.12] via-slate-900/[0.03] dark:via-white/[0.03] to-transparent p-3.5 transition-colors hover:border-energy-green-light/40 group-data-[collapsible=icon]:hidden"
                >
                  <div className="mb-3 flex -space-x-2">
                    {available.slice(0, 3).map((app) => (
                      <div
                        key={app.id}
                        className="flex size-8 items-center justify-center rounded-lg text-base text-white ring-2 ring-energy-blue-dark"
                        style={{ backgroundColor: APP_BRAND_COLORS[app.id] ?? "#334155" }}
                      >
                        {app.icon}
                      </div>
                    ))}
                  </div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Conecte seus aparelhos</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-white/50">
                    Acompanhe o consumo em tempo real da sua casa inteligente.
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-energy-green-light">
                    Conectar agora
                    <ArrowRight className="size-3.5 transition-transform group-hover/empty:translate-x-0.5" />
                  </span>
                </Link>
                <SidebarMenu className="hidden group-data-[collapsible=icon]:flex">
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Conectar integração" className={navButtonClass(false)}>
                      <Link to="/apps" onClick={closeOnMobile}>
                        <Plus />
                        <span>Conectar integração</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </>
            ) : (
              <SidebarMenu className="gap-1.5">
                {apps.map((app) => {
                  const active = isActive(app.url);
                  const brand = APP_BRAND_COLORS[app.id] ?? "#334155";
                  return (
                    <SidebarMenuItem key={app.id}>
                      <SidebarMenuButton
                        asChild
                        size="lg"
                        isActive={active}
                        tooltip={`${app.name} · Conectado`}
                        className={cn(
                          "h-12 gap-3 rounded-xl border px-2 transition-all duration-200",
                          "group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:!p-0",
                          active
                            ? "border-slate-900/15 dark:border-white/15 bg-slate-900/[0.08] dark:bg-white/[0.08] text-slate-900 dark:text-white hover:bg-slate-900/[0.1] dark:hover:bg-white/[0.1] hover:text-slate-900 dark:hover:text-white data-[active=true]:bg-slate-900/[0.08] dark:data-[active=true]:bg-white/[0.08] data-[active=true]:text-slate-900 dark:data-[active=true]:text-white"
                            : "border-transparent text-slate-700 dark:text-white/75 hover:border-slate-900/[0.08] dark:hover:border-white/[0.08] hover:bg-slate-900/[0.04] dark:hover:bg-white/[0.04] hover:text-slate-900 dark:hover:text-white"
                        )}
                      >
                        <Link
                          to={app.url}
                          onClick={closeOnMobile}
                          aria-current={active ? "page" : undefined}
                        >
                          <div
                            className="relative flex size-8 shrink-0 items-center justify-center rounded-lg text-base text-white shadow-md"
                            style={{ backgroundColor: brand, boxShadow: active ? `0 0 16px ${brand}66` : undefined }}
                          >
                            {app.icon}
                            <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-energy-green-light ring-2 ring-white dark:ring-energy-blue-dark" />
                          </div>
                          <div className="grid flex-1 leading-tight">
                            <span className="truncate text-sm font-semibold">{app.name}</span>
                            <span className="flex items-center gap-1.5 truncate text-[11px] text-slate-500 dark:text-white/45">
                              <span className="relative flex size-1.5">
                                <span className="absolute inline-flex size-full animate-ping rounded-full bg-energy-green-light opacity-60" />
                                <span className="relative inline-flex size-1.5 rounded-full bg-energy-green-light" />
                              </span>
                              Conectado
                            </span>
                          </div>
                          <ChevronRight
                            className={cn(
                              "size-4 shrink-0 transition-colors",
                              active ? "text-energy-green-light" : "text-slate-300 dark:text-white/25"
                            )}
                          />
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
                {available.length > apps.length && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      tooltip="Adicionar integração"
                      className="h-10 gap-3 rounded-xl px-2 text-xs font-medium text-slate-500 dark:text-white/45 hover:bg-slate-900/[0.04] dark:hover:bg-white/[0.04] hover:text-energy-green-light"
                    >
                      <Link to="/apps" onClick={closeOnMobile}>
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-900/20 dark:border-white/20">
                          <Plus className="size-4" />
                        </span>
                        <span>Adicionar integração</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  tooltip={user?.name || "Conta"}
                  aria-label="Opções da conta"
                  className="rounded-xl border border-slate-900/[0.08] dark:border-white/[0.08] bg-slate-900/[0.04] dark:bg-white/[0.04] text-slate-900 dark:text-white hover:bg-slate-900/[0.08] dark:hover:bg-white/[0.08] hover:text-slate-900 dark:hover:text-white data-[state=open]:bg-slate-900/[0.08] dark:data-[state=open]:bg-white/[0.08] data-[state=open]:text-slate-900 dark:data-[state=open]:text-white group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent"
                >
                  <div className="flex aspect-square size-8 items-center justify-center rounded-full bg-gradient-to-br from-energy-blue-light to-indigo-600 text-xs font-semibold text-white">
                    {getInitials(user?.name)}
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{user?.name || "Usuário"}</span>
                    <span className="truncate text-xs text-slate-500 dark:text-white/45">
                      {user?.email || "usuario@email.com"}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4 text-slate-400 dark:text-white/40" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side={isMobile ? "bottom" : "right"}
                align="end"
                sideOffset={8}
                className="w-72 overflow-hidden rounded-2xl border-slate-200 bg-white dark:border-white/10 dark:bg-energy-blue-dark p-0 text-slate-900 dark:text-white shadow-2xl shadow-slate-900/10 dark:shadow-black/50"
              >
                {/* Cabeçalho com faixa em gradiente e avatar grande. */}
                <div className="relative px-4 pb-4 pt-5">
                  <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-br from-energy-green-light/20 via-emerald-600/5 dark:from-energy-green-light/30 dark:via-emerald-600/10 to-transparent" />
                  <div className="relative flex items-center gap-3">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-energy-blue-light to-indigo-600 text-base font-bold text-white shadow-lg ring-2 ring-white/10">
                      {getInitials(user?.name)}
                    </div>
                    <div className="grid min-w-0 leading-tight">
                      <span className="truncate text-sm font-semibold">{user?.name || "Usuário"}</span>
                      <span className="truncate text-xs text-slate-500 dark:text-white/50">
                        {user?.email || "usuario@email.com"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="px-3 pb-3">
                  <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-white/35">
                    Aparência
                  </p>
                  <div role="radiogroup" aria-label="Tema" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-900/[0.05] dark:bg-white/[0.05] p-1">
                    {themeOptions.map((option) => {
                      const selected = theme === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setTheme(option.value)}
                          className={cn(
                            "flex flex-col items-center gap-1 rounded-lg py-2 text-[11px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-energy-green-light",
                            selected
                              ? "bg-energy-green-light text-energy-blue-dark shadow-md shadow-energy-green-light/25"
                              : "text-slate-500 dark:text-white/55 hover:bg-slate-900/[0.06] dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white"
                          )}
                        >
                          <option.icon className="size-4" />
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <DropdownMenuSeparator className="m-0 bg-slate-900/[0.08] dark:bg-white/[0.08]" />
                <div className="p-1.5">
                  {[
                    { label: "Página inicial", icon: Home, url: "/" },
                    { label: "Integrações", icon: Settings2, url: "/apps" },
                    { label: "Sobre o WattStatus", icon: Info, url: "/sobre" },
                  ].map((item) => (
                    <DropdownMenuItem
                      key={item.url}
                      onClick={() => navigate(item.url)}
                      className="group/item gap-3 rounded-lg px-2.5 py-2 text-sm text-slate-700 dark:text-white/80 focus:bg-slate-900/[0.06] dark:focus:bg-white/[0.06] focus:text-slate-900 dark:focus:text-white"
                    >
                      <span className="flex size-7 items-center justify-center rounded-md bg-slate-900/[0.06] dark:bg-white/[0.06] text-slate-600 dark:text-white/60 group-focus/item:text-energy-green-light">
                        <item.icon className="size-4" />
                      </span>
                      {item.label}
                      <ChevronRight className="ml-auto size-4 text-slate-300 dark:text-white/25" />
                    </DropdownMenuItem>
                  ))}
                </div>

                <DropdownMenuSeparator className="m-0 bg-slate-900/[0.08] dark:bg-white/[0.08]" />
                <div className="p-1.5">
                  <DropdownMenuItem
                    onClick={handleLogout}
                    className="gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-red-600 focus:bg-red-500/10 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
                  >
                    <span className="flex size-7 items-center justify-center rounded-md bg-red-500/10">
                      <LogOut className="size-4" />
                    </span>
                    Sair da conta
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </ShadcnSidebar>
  );
}

export { SidebarProvider, SidebarTrigger };
