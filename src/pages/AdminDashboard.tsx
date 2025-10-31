import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Users, Zap, Database, ArrowLeft, RefreshCw } from "lucide-react";

interface UserWithAppliances {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  appliances: any[];
}

interface AdminData {
  users: UserWithAppliances[];
  totalUsers: number;
  totalAppliances: number;
}

const AdminDashboard = () => {
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const fetchAdminData = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("http://localhost:3001/api/admin/all-data", {
        headers: {
          Authorization: "Bearer admin-token",
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Falha ao buscar dados administrativos");
      }

      const adminData = await response.json();
      setData(adminData);
    } catch (err: any) {
      setError(err.message || "Erro ao carregar dados");
      console.error("Error fetching admin data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("wattstatus_user");
    navigate("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-energy-500" />
          <p className="text-gray-600 dark:text-gray-400">
            Carregando dados administrativos...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/dashboard")}
                className="flex items-center space-x-2"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Voltar ao Dashboard</span>
              </Button>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Painel Administrativo
              </h1>
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              Sair
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Estatísticas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total de Usuários
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data?.totalUsers || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total de Aparelhos
              </CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {data?.totalAppliances || 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Banco de Dados
              </CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">TXT Files</div>
              <p className="text-xs text-muted-foreground">
                Persistência em arquivos
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Lista de Usuários */}
        <Card>
          <CardHeader>
            <CardTitle>Usuários Cadastrados</CardTitle>
            <CardDescription>
              Lista completa de todos os usuários e seus aparelhos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {data?.users.map((user) => (
                <div key={user.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-semibold">{user.name}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {user.email}
                      </p>
                      <p className="text-xs text-gray-500">
                        Criado em:{" "}
                        {new Date(user.createdAt).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <Badge
                      variant={user.role === "admin" ? "default" : "secondary"}
                    >
                      {user.role}
                    </Badge>
                  </div>

                  <div className="mt-4">
                    <h4 className="text-sm font-medium mb-2">
                      Aparelhos ({user.appliances.length})
                    </h4>
                    {user.appliances.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {user.appliances.map((appliance) => (
                          <div
                            key={appliance.id}
                            className="bg-gray-50 dark:bg-slate-700 rounded p-3"
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-medium text-sm">
                                  {appliance.name}
                                </p>
                                <p className="text-xs text-gray-600 dark:text-gray-400">
                                  {appliance.power}W • {appliance.usageHours}
                                  h/dia
                                </p>
                                <p className="text-xs text-gray-500">
                                  R$ {appliance.monthlyCost.toFixed(2)}/mês
                                </p>
                              </div>
                              <Badge
                                variant={
                                  appliance.status === "critical"
                                    ? "destructive"
                                    : appliance.status === "warning"
                                    ? "default"
                                    : "secondary"
                                }
                                className="text-xs"
                              >
                                {appliance.status}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 italic">
                        Nenhum aparelho cadastrado
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminDashboard;
