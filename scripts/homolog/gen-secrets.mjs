// Prints fresh secrets for the homologation site. Nothing is written to disk:
// paste them straight into Netlify (Site configuration › Environment variables,
// scope Functions) and close the terminal.
//
//   node scripts/homolog/gen-secrets.mjs
import { randomBytes } from "node:crypto";

const secret = () => randomBytes(48).toString("base64url");
console.log(`JWT_SECRET=${secret()}`);
console.log(`SMARTTHINGS_TOKEN_SECRET=${secret()}`);
console.error("\nSegredos novos e exclusivos da homologação. Não reutilize em outro ambiente e não salve em arquivo do repositório.");
