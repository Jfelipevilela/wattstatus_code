import { DeviceIntegration } from "./types";

export class IntegrationManager {
  private integrations = new Map<string, DeviceIntegration>();

  register(integration: DeviceIntegration) {
    this.integrations.set(integration.id, integration);
  }

  list() {
    return Array.from(this.integrations.values()).map((integration) => ({
      id: integration.id,
      name: integration.name,
      vendor: integration.vendor,
      configured: integration.isConfigured(),
    }));
  }

  get(id: string) {
    return this.integrations.get(id);
  }
}
