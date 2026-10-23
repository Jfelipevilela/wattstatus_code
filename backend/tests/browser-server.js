// Isolated browser smoke-test fixture. Never imports a production database or credentials.
const path = require("node:path");
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "browser-fixture-isolated-secret-with-32-characters";
process.env.APP_ORIGINS = "http://localhost:4411,http://127.0.0.1:4411";
const express = require("express");
const { createApp } = require("../dist/app");
const { IntegrationManager } = require("../dist/modules/integrations/integration-manager");
const { logger } = require("../dist/logging/logger");
const { catalogSeed } = require("../dist/modules/catalog/catalog.seed");
const { catalogTokens } = require("../dist/modules/catalog/catalog.schema");
const { AuthService } = require("../dist/modules/auth/auth.service");
const { AUTH_COOKIE_NAME, cookieOptions, SESSION_SECONDS } = require("../dist/modules/auth/auth-security");
const { randomUUID } = require("node:crypto");
for (const level of ["info", "warn", "error", "debug"]) logger[level] = () => {};
const users = new Map(), sessions = new Map(), limits = new Map(), appliances = new Map(), settings = new Map();
const db = {
  getCatalogDevice: async id => catalogSeed.devices.find(device => device.id === id) || null,
  searchCatalog: async query => {
    const devices = catalogSeed.devices.filter(device => {
      const tokens = catalogTokens([device.displayName, device.category, catalogSeed.categories.find(row => row.id === device.category)?.name,
        device.subcategory, device.brand, device.model, ...device.aliases].filter(Boolean).join(" "));
      return (!query.search || catalogTokens(query.search).every(token => tokens.includes(token))) &&
        (!query.category || device.category === query.category) && (!query.subcategory || device.subcategory === query.subcategory) &&
        (!query.brand || device.brand === query.brand) && (!query.model || device.model === query.model);
    });
    const facet = catalogSeed.devices.filter(device => !query.category || device.category === query.category);
    return { devices: devices.slice((query.page - 1) * query.limit, query.page * query.limit), total: devices.length,
      page: query.page, limit: query.limit, brands: [...new Set(facet.map(row => row.brand).filter(Boolean))].sort(),
      subcategories: [...new Set(facet.map(row => row.subcategory))].sort() };
  },
  getUserByEmail: async email => [...users.values()].find(user => user.email === email),
  getUserById: async id => users.get(id),
  addUser: async user => {
    if ([...users.values()].some(existing => existing.email === user.email)) {
      const error = new Error("duplicate"); error.code = 11000; throw error;
    }
    users.set(user.id, user);
  },
  updatePasswordHash: async (id, _previous, hash) => { users.get(id).passwordHash = hash; },
  addSession: async session => sessions.set(session.id, session),
  getSession: async id => sessions.get(id)?.expiresAt > new Date() ? sessions.get(id) : null,
  deleteSession: async id => sessions.delete(id),
  consumeRateLimit: async (scope, key, windowMs) => {
    const window = Math.floor(Date.now() / windowMs), identity = `${scope}:${window}:${key}`;
    const hits = (limits.get(identity) || 0) + 1; limits.set(identity, hits);
    return { totalHits: hits, resetTime: new Date((window + 1) * windowMs) };
  },
  listAppliances: async userId => [...appliances.values()].filter(row => row.userId === userId),
  addAppliance: async row => {
    if (row.importKey && [...appliances.values()].some(item => item.importKey === row.importKey)) throw new Error("DEVICE_ALREADY_IMPORTED");
    appliances.set(row.id, row); return row;
  },
  updateAppliance: async (userId, row) => {
    if (appliances.get(row.id)?.userId !== userId) return null;
    appliances.set(row.id, row); return row;
  },
  deleteAppliance: async (userId, id) => appliances.get(id)?.userId === userId ? appliances.delete(id) : false,
  getUserSettings: async userId => settings.get(userId) || { userId, theme: "system", apps: [], historicalData: [] },
  updateUserSettings: async (userId, input) => { const row = { userId, ...input }; settings.set(userId, row); return row; },
  getIntegrationUsageHistory: async () => [], getIntegrationUsage: async () => [], getIntegrationToken: async () => null,
  getEnergyHistory: async () => [],
};
const app = createApp({ db, integrationManager: new IntegrationManager() });
// Test-only shortcut for visual checks; this file is not a production entry point.
app.get('/__test__/start', async (_req, res, next) => {
  try {
    const { token } = await new AuthService(db).register({ name: 'Teste Biblioteca', email: `${randomUUID()}@example.invalid`,
      password: 'Senha-sintetica-isolada-2026!', confirmPassword: 'Senha-sintetica-isolada-2026!', acceptTerms: true });
    res.cookie(AUTH_COOKIE_NAME, token, { ...cookieOptions, maxAge: SESSION_SECONDS * 1000 });
    res.redirect('/aparelhos?adicionar=1');
  } catch (error) { next(error); }
});
const dist = path.resolve(__dirname, "../../dist");
app.use(express.static(dist));
app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
app.listen(4411, "127.0.0.1", () => console.log("Isolated browser fixture: http://127.0.0.1:4411"));
