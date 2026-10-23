// Isolated browser smoke-test fixture. Never imports a production database or credentials.
const path = require("node:path");
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "browser-fixture-isolated-secret-with-32-characters";
process.env.APP_ORIGINS = "http://localhost:4411,http://127.0.0.1:4411";
const express = require("express");
const { createApp } = require("../dist/app");
const { IntegrationManager } = require("../dist/modules/integrations/integration-manager");
const { logger } = require("../dist/logging/logger");
for (const level of ["info", "warn", "error", "debug"]) logger[level] = () => {};
const users = new Map(), sessions = new Map(), limits = new Map(), appliances = new Map(), settings = new Map();
const db = {
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
  addAppliance: async row => { appliances.set(row.id, row); return row; },
  updateAppliance: async (userId, row) => {
    if (appliances.get(row.id)?.userId !== userId) return null;
    appliances.set(row.id, row); return row;
  },
  deleteAppliance: async (userId, id) => appliances.get(id)?.userId === userId ? appliances.delete(id) : false,
  getUserSettings: async userId => settings.get(userId) || { userId, theme: "system", apps: [], historicalData: [] },
  updateUserSettings: async (userId, input) => { const row = { userId, ...input }; settings.set(userId, row); return row; },
  getIntegrationUsageHistory: async () => [], getIntegrationUsage: async () => [], getIntegrationToken: async () => null,
};
const app = createApp({ db, integrationManager: new IntegrationManager() });
const dist = path.resolve(__dirname, "../../dist");
app.use(express.static(dist));
app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
app.listen(4411, "127.0.0.1", () => console.log("Isolated browser fixture: http://127.0.0.1:4411"));
