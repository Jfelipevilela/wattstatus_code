import bcrypt from "bcryptjs";
import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import { ApiError } from "../../middleware/error-handler";

const parameters = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const dummyHash = `scrypt$32768$8$3$${"00".repeat(16)}$${"00".repeat(64)}`;
let activeOperations = 0;

// Bound CPU/memory work per instance instead of building an unbounded hashing queue.
const passwordWork = async <T>(action: () => Promise<T>): Promise<T> => {
  if (activeOperations >= 2) throw new ApiError(503, "Autenticação ocupada. Tente novamente em instantes.");
  activeOperations++;
  try { return await action(); } finally { activeOperations--; }
};
const derive = (password: string, salt: Buffer) => new Promise<Buffer>((resolve, reject) => {
  scrypt(password, salt, 64, parameters, (error, key) => error ? reject(error) : resolve(key));
});
export const hashPassword = (password: string) => passwordWork(async () => {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$32768$8$3$${salt.toString("hex")}$${key.toString("hex")}`;
});
export const verifyPassword = (password: string, storedHash?: string) => passwordWork(async () => {
  if (storedHash?.startsWith("$2")) return bcrypt.compare(password, storedHash);
  const hash = storedHash || dummyHash;
  if (!/^scrypt\$32768\$8\$3\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(hash)) return false;
  const parts = hash.split("$");
  const key = await derive(password, Buffer.from(parts[4], "hex"));
  return timingSafeEqual(key, Buffer.from(parts[5], "hex")) && Boolean(storedHash);
});
