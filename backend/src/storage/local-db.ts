import { mkdir, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { ApplianceRecord, UserRecord } from "../types";

interface DatabaseShape {
  users: UserRecord[];
  appliances: ApplianceRecord[];
}

const DEFAULT_DB: DatabaseShape = {
  users: [],
  appliances: [],
};

export class LocalDatabase {
  private db: DatabaseShape = { ...DEFAULT_DB };
  private readonly filePath: string;

  constructor(customPath?: string) {
    this.filePath =
      customPath || path.resolve(__dirname, "..", "..", "data", "db.json");
  }

  async init() {
    const dir = path.dirname(this.filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    if (!existsSync(this.filePath)) {
      await this.persist();
      return;
    }

    const content = await readFile(this.filePath, "utf-8");
    try {
      this.db = { ...DEFAULT_DB, ...JSON.parse(content) };
    } catch (err) {
      console.warn("Failed to parse database file, starting fresh.", err);
      this.db = { ...DEFAULT_DB };
      await this.persist();
    }
  }

  private async persist() {
    await writeFile(this.filePath, JSON.stringify(this.db, null, 2), "utf-8");
  }

  async getUserByEmail(email: string) {
    return this.db.users.find(
      (user) => user.email.toLowerCase() === email.toLowerCase()
    );
  }

  async addUser(user: UserRecord) {
    this.db.users.push(user);
    await this.persist();
    return user;
  }

  async getUserById(userId: string) {
    return this.db.users.find((user) => user.id === userId);
  }

  async listAppliances(userId: string) {
    return this.db.appliances.filter((item) => item.userId === userId);
  }

  async addAppliance(record: ApplianceRecord) {
    this.db.appliances.push(record);
    await this.persist();
    return record;
  }

  async updateAppliance(userId: string, record: ApplianceRecord) {
    const index = this.db.appliances.findIndex(
      (item) => item.id === record.id && item.userId === userId
    );
    if (index === -1) return null;
    this.db.appliances[index] = record;
    await this.persist();
    return record;
  }

  async deleteAppliance(userId: string, applianceId: string) {
    const before = this.db.appliances.length;
    this.db.appliances = this.db.appliances.filter(
      (item) => !(item.id === applianceId && item.userId === userId)
    );
    if (before !== this.db.appliances.length) {
      await this.persist();
      return true;
    }
    return false;
  }
}
