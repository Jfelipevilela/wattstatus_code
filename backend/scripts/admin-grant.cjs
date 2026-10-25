// Controlled provisioning of administrative access. There is no HTTP route for
// this: only an operator with direct database access can grant or revoke.
// Grants are tied to the user id, never to an e-mail address, because
// registration does not verify e-mail ownership.
//
//   MONGO_URL=... MONGO_DB_NAME=... node scripts/admin-grant.cjs find --email=ops@example.com
//   ... node scripts/admin-grant.cjs grant --user-id=<uuid> --reason="ticket 123"
//   ... node scripts/admin-grant.cjs revoke --user-id=<uuid> --reason="left the team"
//   ... node scripts/admin-grant.cjs list
//
// Before granting, confirm out of band that the person controls the account
// (for example, they sign in while you watch `find` show the same id).
const { MongoClient } = require("mongodb");
const os = require("node:os");

const arg = (name) => process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
const command = process.argv[2];
const url = process.env.MONGO_URL;
const dbName = process.env.MONGO_DB_NAME || "wattstatus";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const main = async () => {
  if (!url) throw new Error("MONGO_URL is required");
  if (!["find", "grant", "revoke", "list"].includes(command)) throw new Error("usage: find|grant|revoke|list");
  const client = new MongoClient(url);
  await client.connect();
  try {
    const db = client.db(dbName);
    const grants = db.collection("admin_grants");
    const operator = os.userInfo().username;
    if (command === "find") {
      const email = arg("email");
      if (!email) throw new Error("--email is required");
      const users = await db.collection("users").find({ email: email.trim().toLowerCase() }, { projection: { _id: 0, id: 1, name: 1, createdAt: 1 } }).toArray();
      console.log(JSON.stringify(users, null, 2));
      return;
    }
    if (command === "list") {
      console.log(JSON.stringify(await grants.find({}, { projection: { _id: 0 } }).toArray(), null, 2));
      return;
    }
    const userId = arg("user-id");
    const reason = arg("reason");
    if (!userId || !UUID.test(userId)) throw new Error("--user-id=<uuid> is required");
    if (!reason) throw new Error("--reason is required");
    if (command === "grant") {
      if (!(await db.collection("users").findOne({ id: userId }, { projection: { _id: 1 } }))) throw new Error("user not found");
      await grants.updateOne({ userId },
        { $set: { userId, grantedAt: new Date(), grantedBy: operator, reason, revokedAt: null } }, { upsert: true });
      console.log(`granted ${userId}`);
    } else {
      const result = await grants.updateOne({ userId, revokedAt: null }, { $set: { revokedAt: new Date(), revokedBy: operator, revokeReason: reason } });
      console.log(result.modifiedCount ? `revoked ${userId}` : `no active grant for ${userId}`);
    }
  } finally { await client.close(); }
};

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
