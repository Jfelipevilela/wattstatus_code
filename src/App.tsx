import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/hooks/use-theme";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Sobre from "./pages/Sobre";
import Login from "./pages/Login";
import SignUp from "./pages/SignUp";
import NotFound from "./pages/NotFound";
import Consumption from "./pages/Consumption";
import Reports from "./pages/Reports";
import Calculadora from "./pages/Calculator";
import Appliances from "./pages/Appliances";
import Anomalies from "./pages/Anomalies";
import Tips from "./pages/Tips";

const queryClient = new QueryClient();

// Simple auth check
const isAuthenticated = () => {
  const user = localStorage.getItem("wattstatus_user");
  if (user) {
    const userData = JSON.parse(user);
    return userData.isLoggedIn;
  }
  return false;
};

// Protected Route component
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  return isAuthenticated() ? <>{children}</> : <Navigate to="/login" replace />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="system" storageKey="wattstatus-ui-theme">
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
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
            <Route path="/sobre" element={<Sobre />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
