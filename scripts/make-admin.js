// Usage: 1) sign up on the website with ADMIN_EMAIL  2) run: npm run make-admin
import "dotenv/config";
import { MongoClient } from "mongodb";

const email = process.env.ADMIN_EMAIL;
if (!email) {
  console.error("Set ADMIN_EMAIL in your .env file first");
  process.exit(1);
}

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const users = client.db(process.env.DB_NAME || "salonbook").collection("user");

const result = await users.updateOne({ email: email.toLowerCase() }, { $set: { role: "admin", isBlocked: false } });
console.log(result.matchedCount ? `✅ ${email} is now an admin` : `❌ No user found with email ${email}. Sign up first.`);
await client.close();
