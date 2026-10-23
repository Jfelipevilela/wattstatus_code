import { z } from "zod";
import { normalizeEmail } from "./auth-security";

const emailSchema = z.string().trim().max(254).email().transform(normalizeEmail);
const passwordSchema = z.string().min(1).max(1024);
const commonPasswords = new Set([
  "123456789012345", "1234567890123456", "passwordpassword", "qwertyuiopasdfgh",
  "abcdefghijklmnop", "senha12345678901", "wattstatus123456",
]);

export const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: emailSchema,
    password: z.string().min(15, "Use uma senha com pelo menos 15 caracteres.").max(128)
      .refine((value) => !commonPasswords.has(value.toLowerCase()), "Escolha uma senha menos comum."),
    confirmPassword: z.string().max(128),
    acceptTerms: z.literal(true, { errorMap: () => ({ message: "Aceite os termos de uso." }) }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Senhas n\u00e3o coincidem",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
