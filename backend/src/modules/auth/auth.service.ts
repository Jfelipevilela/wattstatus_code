import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";
import { env } from "../../config/env";
import { ApiError } from "../../middleware/error-handler";
import { PostgresDatabase } from "../../storage/postgres-db";
import { UserRecord } from "../../types";
import { LoginInput, RegisterInput } from "./auth.schema";

export class AuthService {
  constructor(private db: PostgresDatabase) {}

  private signToken(userId: string) {
    return jwt.sign({ sub: userId }, env.jwtSecret, { expiresIn: "12h" });
  }

  async register(input: RegisterInput) {
    const existing = await this.db.getUserByEmail(input.email);
    if (existing) {
      throw new ApiError(409, "Usu\u00e1rio j\u00e1 existe");
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const user: UserRecord = {
      id: uuid(),
      name: input.name,
      email: input.email,
      passwordHash,
      createdAt: new Date().toISOString(),
    };

    await this.db.addUser(user);

    return {
      token: this.signToken(user.id),
      user: { id: user.id, name: user.name, email: user.email },
    };
  }

  async login(input: LoginInput) {
    const user = await this.db.getUserByEmail(input.email);
    if (!user) {
      throw new ApiError(401, "Credenciais inv\u00e1lidas");
    }

    const isValid = await bcrypt.compare(input.password, user.passwordHash);
    if (!isValid) {
      throw new ApiError(401, "Credenciais inv\u00e1lidas");
    }

    return {
      token: this.signToken(user.id),
      user: { id: user.id, name: user.name, email: user.email },
    };
  }

  async me(userId: string) {
    const user = await this.db.getUserById(userId);
    if (!user) {
      throw new ApiError(404, "Usu\u00e1rio n\u00e3o encontrado");
    }
    return { id: user.id, name: user.name, email: user.email };
  }
}
