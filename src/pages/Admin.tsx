import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Users, Zap, Database, Shield } from "lucide-react";
import { fileStorage, User } from "@/utils/fileStorage";
import { Appliance } from "@/hooks/useAppliances";

const Admin = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [allAppliances, setAllAppliances] = useState<
    { userId: string; userName: string; appliances: Appliance[] }[]
  >([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    // Verificar se usuário é admin
    const userData = localStorage.getItem("wattstatus_user");
    if (!userData) {
      navigate("/login");
      return;
    }

    try {
      const user = JSON.parse(userData);
      if (user.role !== "admin") {
        navigate("/dashboard");
        return;
      }
      setCurrentUser(user);
    } catch (error) {
      navigate("/login");
      return;
    }

    loadData();
  }, [navigate]);

  const loadData = () => {
    try {
      const allUsers = fileStorage.getAllUsers();
      const appliancesData = fileStorage.getAllAppliances();
      setUsers(allUsers);
      setAllAppliances(appliancesData);
    } catch (error) {
      setError("Erro ao carregar dados");
      console.error("Error loading admin data:", error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("wattstatus_user");
    navigate("/login");
  };

  const getTotalAppliances = () => {
    return allAppliances.reduce(
      (total, user) => total + user.appliances.length,
      0
    );
  };

  const getTotalConsumption = () => {
    return allAppliances.reduce((total, user) => {
      return (
        total +
        user.appliances.reduce(
          (userTotal, appliance) => userTotal + appliance.monthlyConsumption,
          0
        )
      );
    }, 0);
  };

  if (!currentUser) {
    return <div>Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <Shield className="h-8 w-8 text-energy-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Painel Administrativo
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  WattStatus - Controle Total
                </p>
              </div>
            </div>
            <Button onClick={handleLogout} variant="outline">
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

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total de Usuários
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{users.length}</div>
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
              <div className="text-2xl font-bold">{getTotalAppliances()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Consumo Total (kWh/mês)
              </CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {getTotalConsumption().toFixed(2)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Administradores
              </CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {users.filter((u) => u.role === "admin").length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="users" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="users">Usuários</TabsTrigger>
            <TabsTrigger value="appliances">Aparelhos por Usuário</TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle>Gerenciamento de Usuários</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Função</TableHead>
                      <TableHead>Data de Cadastro</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">
                          {user.name}
                        </TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              user.role === "admin" ? "default" : "secondary"
                            }
                          >
                            {user.role === "admin"
                              ? "Administrador"
                              : "Usuário"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(user.createdAt).toLocaleDateString("pt-BR")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="appliances">
            <Card>
              <CardHeader>
                <CardTitle>Aparelhos por Usuário</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {allAppliances.map((userData) => (
                    <div
                      key={userData.userId}
                      className="border rounded-lg p-4"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">
                          {userData.userName}
                        </h3>
                        <Badge variant="outline">
                          {userData.appliances.length} aparelho(s)
                        </Badge>
                      </div>

                      {userData.appliances.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Nome</TableHead>
                              <TableHead>Potência (W)</TableHead>
                              <TableHead>Horas/Dia</TableHead>
                              <TableHead>Consumo Mensal (kWh)</TableHead>
                              <TableHead>Custo Mensal (R$)</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {userData.appliances.map((appliance) => (
                              <TableRow key={appliance.id}>
                                <TableCell className="font-medium">
                                  {appliance.name}
                                </TableCell>
                                <TableCell>{appliance.power}</TableCell>
                                <TableCell>{appliance.usageHours}</TableCell>
                                <TableCell>
                                  {appliance.monthlyConsumption.toFixed(2)}
                                </TableCell>
                                <TableCell>
                                  R$ {appliance.monthlyCost.toFixed(2)}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={
                                      appliance.status === "critical"
                                        ? "destructive"
                                        : appliance.status === "warning"
                                        ? "secondary"
                                        : "default"
                                    }
                                  >
                                    {appliance.status === "critical"
                                      ? "Crítico"
                                      : appliance.status === "warning"
                                      ? "Atenção"
                                      : "Normal"}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <p className="text-gray-500 text-center py-4">
                          Nenhum aparelho cadastrado
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;
