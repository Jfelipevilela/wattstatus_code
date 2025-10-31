import { Appliance } from "@/hooks/useAppliances";

export interface User {
  id: string;
  name: string;
  email: string;
  password: string; // Será hashada
  role: "user" | "admin";
  createdAt: string;
}

// Simula um sistema de arquivos TXT usando localStorage
class FileStorage {
  private readFile(filePath: string): string {
    const content = localStorage.getItem(`wattstatus_file_${filePath}`);
    return content || "";
  }

  private writeFile(filePath: string, content: string): void {
    localStorage.setItem(`wattstatus_file_${filePath}`, content);
  }

  private appendFile(filePath: string, content: string): void {
    const existing = this.readFile(filePath);
    this.writeFile(filePath, existing + content);
  }

  // Usuários
  getAllUsers(): User[] {
    const content = this.readFile("data/users.txt");
    if (!content) return [];

    return content
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean) as User[];
  }

  saveUser(user: User): void {
    const userLine = JSON.stringify(user) + "\n";
    this.appendFile("data/users.txt", userLine);
  }

  findUserByEmail(email: string): User | null {
    const users = this.getAllUsers();
    return users.find((user) => user.email === email) || null;
  }

  findUserById(id: string): User | null {
    const users = this.getAllUsers();
    return users.find((user) => user.id === id) || null;
  }

  // Aparelhos - todos em um único arquivo
  getUserAppliances(userId: string): Appliance[] {
    const content = this.readFile("data/appliances.txt");
    if (!content) return [];

    return content
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        try {
          const appliance = JSON.parse(line);
          return appliance.userId === userId ? appliance : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as Appliance[];
  }

  saveUserAppliance(userId: string, appliance: Appliance): void {
    const applianceWithUser = { ...appliance, userId };
    const applianceLine = JSON.stringify(applianceWithUser) + "\n";
    this.appendFile("data/appliances.txt", applianceLine);
  }

  updateUserAppliance(userId: string, appliance: Appliance): void {
    const allAppliances = this.getAllAppliancesRaw();
    const updatedAppliances = allAppliances.map((app) =>
      app.id === appliance.id && app.userId === userId
        ? { ...appliance, userId }
        : app
    );
    this.saveAllAppliances(updatedAppliances);
  }

  deleteUserAppliance(userId: string, applianceId: number): void {
    const allAppliances = this.getAllAppliancesRaw();
    const filteredAppliances = allAppliances.filter(
      (app) => !(app.id === applianceId && app.userId === userId)
    );
    this.saveAllAppliances(filteredAppliances);
  }

  private getAllAppliancesRaw(): Appliance[] {
    const content = this.readFile("data/appliances.txt");
    if (!content) return [];

    return content
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean) as Appliance[];
  }

  private saveAllAppliances(appliances: Appliance[]): void {
    const content =
      appliances.map((app) => JSON.stringify(app)).join("\n") + "\n";
    this.writeFile("data/appliances.txt", content);
  }

  // Admin functions
  getAllAppliances(): {
    userId: string;
    userName: string;
    appliances: Appliance[];
  }[] {
    const users = this.getAllUsers();
    return users.map((user) => ({
      userId: user.id,
      userName: user.name,
      appliances: this.getUserAppliances(user.id),
    }));
  }

  // Utilitários
  clearAllData(): void {
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (key.startsWith("wattstatus_file_")) {
        localStorage.removeItem(key);
      }
    });
  }
}

export const fileStorage = new FileStorage();

// Função para hash simples de senha (em produção, use bcrypt)
export const hashPassword = (password: string): string => {
  // Hash simples para demo - em produção use bcrypt ou similar
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Converte para 32 bits
  }
  return hash.toString();
};

export const verifyPassword = (password: string, hash: string): boolean => {
  return hashPassword(password) === hash;
};
