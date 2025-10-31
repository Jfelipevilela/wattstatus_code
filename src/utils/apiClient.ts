// Cliente API para comunicação com o servidor backend
class ApiClient {
  private baseUrl = "http://localhost:3001/api";

  private async request(endpoint: string, options: RequestInit = {}) {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("API request error:", error);
      throw error;
    }
  }

  // Usuários
  async getUsers() {
    return this.request("/users");
  }

  async createUser(userData: {
    name: string;
    email: string;
    password: string;
  }) {
    return this.request("/users", {
      method: "POST",
      body: JSON.stringify(userData),
    });
  }

  async login(credentials: { email: string; password: string }) {
    return this.request("/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    });
  }

  // Aparelhos
  async getUserAppliances(userId: string) {
    return this.request(`/appliances/${userId}`);
  }

  async createAppliance(userId: string, appliance: any) {
    return this.request(`/appliances/${userId}`, {
      method: "POST",
      body: JSON.stringify(appliance),
    });
  }

  async updateAppliance(userId: string, applianceId: number, appliance: any) {
    return this.request(`/appliances/${userId}/${applianceId}`, {
      method: "PUT",
      body: JSON.stringify(appliance),
    });
  }

  async deleteAppliance(userId: string, applianceId: number) {
    return this.request(`/appliances/${userId}/${applianceId}`, {
      method: "DELETE",
    });
  }
}

export const apiClient = new ApiClient();
