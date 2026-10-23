import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/hooks/use-theme";
import { lazy, Suspense } from "react";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { AppsProvider } from "./hooks/useApps";
import { UserPreferencesProvider } from "./hooks/useUserPreferences";

const queryClient = new QueryClient();
const Index = lazy(() => import("./pages/Index"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Sobre = lazy(() => import("./pages/Sobre"));
const Login = lazy(() => import("./pages/Login"));
const SignUp = lazy(() => import("./pages/SignUp"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Reports = lazy(() => import("./pages/Reports"));
const Calculadora = lazy(() => import("./pages/Calculator"));
const Appliances = lazy(() => import("./pages/Appliances"));
const Anomalies = lazy(() => import("./pages/Anomalies"));
const Tips = lazy(() => import("./pages/Tips"));
const SmartThings = lazy(() => import("./pages/SmartThings"));
const SmartThingsCallback = lazy(() => import("./pages/SmartThingsCallback"));
const Apps = lazy(() => import("./pages/Apps"));

// Protected Route component
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { token, user, loading } = useAuth();
  if (loading) {
    return <div className="p-8 text-center text-sm">Carregando...</div>;
  }
  return user || token ? <>{children}</> : <Navigate to="/login" replace />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <UserPreferencesProvider>
        <AppsProvider>
          <ThemeProvider defaultTheme="system">
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <Suspense fallback={<div className="p-8 text-center text-sm" role="status">Carregando página…</div>}>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/signup" element={<SignUp />} />
                  <Route
                    path="/dashboard"
                    element={
                      <ProtectedRoute>
                        <Dashboard />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/relatorios"
                    element={
                      <ProtectedRoute>
                        <Reports />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/calculadora"
                    element={
                      <ProtectedRoute>
                        <Calculadora />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/aparelhos"
                    element={
                      <ProtectedRoute>
                        <Appliances />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/anomalias"
                    element={
                      <ProtectedRoute>
                        <Anomalies />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/dicas"
                    element={
                      <ProtectedRoute>
                        <Tips />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/integracoes/smartthings"
                    element={
                      <ProtectedRoute>
                        <SmartThings />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/integracoes/smartthings/callback"
                    element={
                      <ProtectedRoute>
                        <SmartThingsCallback />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/apps"
                    element={
                      <ProtectedRoute>
                        <Apps />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/sobre" element={<Sobre />} />
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
                </Suspense>
              </BrowserRouter>
            </TooltipProvider>
          </ThemeProvider>
        </AppsProvider>
      </UserPreferencesProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
