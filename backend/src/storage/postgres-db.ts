import { Pool } from "pg";
import crypto from "crypto";
import {
  ApplianceRecord,
  IntegrationUsageHistory,
  UserRecord,
  UserSettingsRecord,
} from "../types";
import { env } from "../config/env";

export class PostgresDatabase {
  private pool: Pool;
  private encKey: Buffer;

  constructor(connectionString?: string) {
    this.pool = new Pool({
      connectionString: connectionString || env.databaseUrl,
    });
    // use 32 bytes key
    this.encKey = crypto
      .createHash("sha256")
      .update(env.smartThingsTokenSecret || "wattstatus-dev-secret")
      .digest();
  }

  async init() {
    await this.pool.query(`
      create table if not exists users (
        id uuid primary key,
        name text not null,
        email text not null unique,
        password_hash text not null,
        created_at timestamptz default now()
      );
    `);

    await this.pool.query(`
      create table if not exists appliances (
        id uuid primary key,
        user_id uuid references users(id) on delete cascade,
        name text not null,
        power numeric not null,
        status text not null,
        usage_hours numeric not null,
        days integer not null,
        monthly_cost numeric not null,
        monthly_consumption numeric not null,
        tariff text not null,
        measured_consumption numeric,
        integration_provider text,
        integration_device_id text,
        created_at timestamptz default now()
      );
    `);

    await this.pool.query(
      "alter table appliances add column if not exists measured_consumption numeric"
    );
    await this.pool.query(
      "alter table appliances add column if not exists integration_provider text"
    );
    await this.pool.query(
      "alter table appliances add column if not exists integration_device_id text"
    );

    await this.pool.query(`
      create table if not exists integration_tokens (
        user_id uuid references users(id) on delete cascade,
        provider text not null,
        token text not null,
        primary key (user_id, provider)
      );
    `);

    await this.pool.query(`
      create table if not exists integration_usage (
        user_id uuid references users(id) on delete cascade,
        provider text not null,
        device_id text not null,
        accumulated_ms numeric not null default 0,
        last_on timestamptz,
        day text not null default to_char(now(), 'YYYY-MM-DD'),
        updated_at timestamptz default now(),
        primary key (user_id, provider, device_id)
      );
    `);
    await this.pool.query(
      "alter table integration_usage add column if not exists day text default to_char(now(), 'YYYY-MM-DD')"
    );

    await this.pool.query(`
      create table if not exists user_settings (
        user_id uuid primary key references users(id) on delete cascade,
        theme text default 'system',
        apps jsonb default '[]',
        historical_data jsonb default '[]',
        created_at timestamptz default now(),
        updated_at timestamptz default now()
      );
    `);

    await this.pool.query(`
      create table if not exists integration_usage_history (
        user_id uuid references users(id) on delete cascade,
        provider text not null,
        device_id text not null,
        day text not null,
        accumulated_ms numeric not null default 0,
        last_on timestamptz,
        updated_at timestamptz default now(),
        primary key (user_id, provider, device_id, day)
      );
    `);
  }

  async getUserByEmail(email: string) {
    const res = await this.pool.query<UserRecord>(
      "select id, name, email, password_hash as \"passwordHash\", created_at as \"createdAt\" from users where lower(email) = lower($1) limit 1",
      [email]
    );
    return res.rows[0];
  }

  async getUserById(id: string) {
    const res = await this.pool.query<UserRecord>(
      "select id, name, email, password_hash as \"passwordHash\", created_at as \"createdAt\" from users where id = $1 limit 1",
      [id]
    );
    return res.rows[0];
  }

  async addUser(user: UserRecord) {
    await this.pool.query(
      `insert into users (id, name, email, password_hash, created_at) values ($1, $2, $3, $4, $5)`,
      [user.id, user.name, user.email, user.passwordHash, user.createdAt]
    );
    return user;
  }

  async listAppliances(userId: string) {
    const res = await this.pool.query<ApplianceRecord>(
      `select
        id,
        user_id as "userId",
        name,
        power::float as power,
        status,
        usage_hours::float as "usageHours",
        days,
        monthly_cost::float as "monthlyCost",
        monthly_consumption::float as "monthlyConsumption",
        tariff,
        measured_consumption::float as "measuredConsumptionKWh",
        integration_provider as "integrationProvider",
        integration_device_id as "integrationDeviceId",
        created_at as "createdAt"
      from appliances
      where user_id = $1
      order by created_at desc`,
      [userId]
    );
    return res.rows;
  }

  async addAppliance(record: ApplianceRecord) {
    await this.pool.query(
      `insert into appliances
      (id, user_id, name, power, status, usage_hours, days, monthly_cost, monthly_consumption, tariff, measured_consumption, integration_provider, integration_device_id, created_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        record.id,
        record.userId,
        record.name,
        record.power,
        record.status,
        record.usageHours,
        record.days,
        record.monthlyCost,
        record.monthlyConsumption,
        record.tariff,
        record.measuredConsumptionKWh ?? null,
        record.integrationProvider ?? null,
        record.integrationDeviceId ?? null,
        record.createdAt,
      ]
    );
    return record;
  }

  async updateAppliance(userId: string, record: ApplianceRecord) {
    const res = await this.pool.query<ApplianceRecord>(
      `update appliances
      set name=$1, power=$2, status=$3, usage_hours=$4, days=$5, monthly_cost=$6, monthly_consumption=$7, tariff=$8, measured_consumption=$9, integration_provider=$10, integration_device_id=$11
      where id=$12 and user_id=$13
      returning id, user_id as "userId", name, power::float as power, status, usage_hours::float as "usageHours", days, monthly_cost::float as "monthlyCost", monthly_consumption::float as "monthlyConsumption", tariff, measured_consumption::float as "measuredConsumptionKWh", integration_provider as "integrationProvider", integration_device_id as "integrationDeviceId", created_at as "createdAt"`,
      [
        record.name,
        record.power,
        record.status,
        record.usageHours,
        record.days,
        record.monthlyCost,
        record.monthlyConsumption,
        record.tariff,
        record.measuredConsumptionKWh ?? null,
        record.integrationProvider ?? null,
        record.integrationDeviceId ?? null,
        record.id,
        userId,
      ]
    );
    return res.rows[0] || null;
  }

  async deleteAppliance(userId: string, applianceId: string) {
    const res = await this.pool.query(
      "delete from appliances where id=$1 and user_id=$2",
      [applianceId, userId]
    );
    return res.rowCount > 0;
  }

  async getUserSettings(userId: string): Promise<UserSettingsRecord> {
    const parseArray = (value: unknown) => {
      if (Array.isArray(value)) return value;
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
      return [];
    };
    const res = await this.pool.query(
      `select user_id as "userId",
              coalesce(theme, 'system') as theme,
              coalesce(apps, '[]') as apps,
              coalesce(historical_data, '[]') as "historicalData",
              created_at as "createdAt",
              updated_at as "updatedAt"
       from user_settings
       where user_id=$1
       limit 1`,
      [userId]
    );
    const row = res.rows[0];
    if (row) {
      return {
        ...row,
        apps: parseArray(row.apps),
        historicalData: parseArray(row.historicalData),
      };
    }
    const now = new Date().toISOString();
    await this.pool.query(
      `insert into user_settings (user_id, theme, apps, historical_data, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$5)`,
      [userId, "system", JSON.stringify([]), JSON.stringify([]), now]
    );
    return {
      userId,
      theme: "system",
      apps: [],
      historicalData: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  async updateUserSettings(
    userId: string,
    input: Partial<UserSettingsRecord>
  ): Promise<UserSettingsRecord> {
    const existing = await this.getUserSettings(userId);
    const updatedAt = new Date().toISOString();
    const merged: UserSettingsRecord = {
      ...existing,
      ...input,
      userId,
      apps: input.apps ?? existing.apps ?? [],
      historicalData: input.historicalData ?? existing.historicalData ?? [],
      updatedAt,
    };

    await this.pool.query(
      `insert into user_settings (user_id, theme, apps, historical_data, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (user_id)
       do update set theme=excluded.theme,
                     apps=excluded.apps,
                     historical_data=excluded.historical_data,
                     updated_at=excluded.updated_at`,
      [
        merged.userId,
        merged.theme,
        JSON.stringify(merged.apps),
        JSON.stringify(merged.historicalData),
        existing.createdAt || updatedAt,
        updatedAt,
      ]
    );

    return merged;
  }

  async saveIntegrationToken(userId: string, provider: string, token: string) {
    const encrypted = this.encrypt(token);
    await this.pool.query(
      `insert into integration_tokens (user_id, provider, token)
       values ($1,$2,$3)
       on conflict (user_id, provider) do update set token = excluded.token`,
      [userId, provider, encrypted]
    );
  }

  async deleteIntegrationToken(userId: string, provider: string) {
    await this.pool.query(
      "delete from integration_tokens where user_id=$1 and provider=$2",
      [userId, provider]
    );
  }

  async getIntegrationToken(userId: string, provider: string) {
    const res = await this.pool.query<{ token: string }>(
      "select token from integration_tokens where user_id=$1 and provider=$2 limit 1",
      [userId, provider]
    );
    const cipher = res.rows[0]?.token;
    if (!cipher) return null;
    try {
      return this.decrypt(cipher);
    } catch {
      return null;
    }
  }

  async getIntegrationUsage(userId: string, provider: string) {
    const res = await this.pool.query(
      `select iu.device_id as "deviceId",
              iu.accumulated_ms::bigint as "accumulatedMs",
              iu.last_on as "lastOn",
              iu.day,
              iu.updated_at as "updatedAt",
              a.name as "deviceName"
       from integration_usage iu
       left join appliances a on a.integration_device_id = iu.device_id and a.user_id = iu.user_id
       where iu.user_id=$1 and iu.provider=$2`,
      [userId, provider]
    );
    return res.rows;
  }

  async getIntegrationUsageHistory(userId: string, days = 7) {
    const windowDays = Math.max(days, 1);
    const res = await this.pool.query<IntegrationUsageHistory>(
      `select iu.user_id as "userId",
              iu.provider,
              iu.device_id as "deviceId",
              iu.day,
              iu.accumulated_ms::bigint as "accumulatedMs",
              iu.last_on as "lastOn",
              a.name as "applianceName"
       from integration_usage_history iu
       left join appliances a on a.integration_device_id = iu.device_id and a.user_id = iu.user_id
       where iu.user_id=$1
         and iu.day >= to_char(now() - ($2 || ' days')::interval, 'YYYY-MM-DD')
       order by iu.day desc`,
      [userId, windowDays]
    );
    return res.rows;
  }

  async saveIntegrationUsage(
    userId: string,
    provider: string,
    usages: Array<{ deviceId: string; accumulatedMs: number; lastOn?: string | null; day: string }>
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      for (const usage of usages) {
        await client.query(
          `insert into integration_usage (user_id, provider, device_id, accumulated_ms, last_on, day, updated_at)
           values ($1,$2,$3,$4,$5,$6, now())
           on conflict (user_id, provider, device_id)
           do update set accumulated_ms=excluded.accumulated_ms, last_on=excluded.last_on, day=excluded.day, updated_at=now()`,
          [
            userId,
            provider,
            usage.deviceId,
            usage.accumulatedMs,
            usage.lastOn ?? null,
            usage.day,
          ]
        );
        await client.query(
          `insert into integration_usage_history (user_id, provider, device_id, day, accumulated_ms, last_on, updated_at)
           values ($1,$2,$3,$4,$5,$6, now())
           on conflict (user_id, provider, device_id, day)
           do update set accumulated_ms=excluded.accumulated_ms, last_on=excluded.last_on, updated_at=now()`,
          [
            userId,
            provider,
            usage.deviceId,
            usage.day,
            usage.accumulatedMs,
            usage.lastOn ?? null,
          ]
        );
      }
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }

  private encrypt(plain: string) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.encKey, iv);
    const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString("base64");
  }

  private decrypt(encoded: string) {
    const buf = Buffer.from(encoded, "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", this.encKey, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return dec.toString("utf8");
  }
}
