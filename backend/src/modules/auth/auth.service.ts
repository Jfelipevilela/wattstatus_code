import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { env } from "../../config/env";
import { ApiError } from "../../middleware/error-handler";
import { MongoDatabase } from "../../storage/mongo-db";
import { UserRecord } from "../../types";
import { LoginInput, RegisterInput } from "./auth.schema";
import { hashPassword, verifyPassword } from "./password";
import { JWT_AUDIENCE, JWT_ISSUER, SESSION_SECONDS, normalizeEmail } from "./auth-security";

export class AuthService {
  constructor(private db: MongoDatabase) {}

  private async signToken(userId: string) {
    const id = randomUUID();
    const token = jwt.sign({ sub: userId, purpose: "access" }, env.jwtSecret, {
      expiresIn: SESSION_SECONDS, algorithm: "HS256", issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE, jwtid: id,
    });
    await this.db.addSession({ id, userId, expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000) });
    return token;
  }

  async register(input: RegisterInput) {
    const existing = await this.db.getUserByEmail(input.email);
    if (existing) {
      throw new ApiError(409, "Não foi possível criar a conta com os dados informados.");
    }

    const passwordHash = await hashPassword(input.password);
    const user: UserRecord = {
      id: randomUUID(),
      name: input.name,
      email: input.email,
      emailCanonical: normalizeEmail(input.email),
      termsAcceptedAt: new Date().toISOString(),
      passwordHash,
      createdAt: new Date().toISOString(),
    };

    try { await this.db.addUser(user); }
    catch (error) {
      if ((error as { code?: number }).code === 11000) {
        throw new ApiError(409, "Não foi possível criar a conta com os dados informados.");
      }
      throw error;
    }

    return {
      token: await this.signToken(user.id),
      user: { id: user.id, name: user.name, email: user.email },
    };
  }

  async login(input: LoginInput) {
    const user = await this.db.getUserByEmail(input.email);
    const isValid = await verifyPassword(input.password, user?.passwordHash);
    if (!user || !isValid) {
      throw new ApiError(401, "Credenciais inv\u00e1lidas");
    }

    // At 72 bytes bcrypt cannot prove the original suffix; do not silently redefine it.
    if (user.passwordHash.startsWith("$2") && Buffer.byteLength(input.password, "utf8") < 72) {
      const passwordHash = await hashPassword(input.password);
      await this.db.updatePasswordHash(user.id, user.passwordHash, passwordHash);
    }

    return {
      token: await this.signToken(user.id),
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
