import { MongoClient } from "mongodb";

let client;
let db;

// Connect once and re-use the connection (important for serverless hosting)
export async function connectDB() {
  if (db) return db;
  client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db(process.env.DB_NAME || "salonbook");

  // A Stripe session can only be saved once -> protects against duplicate webhooks
  await db.collection("transactions").createIndex({ stripeSessionId: 1 }, { unique: true });
  console.log("MongoDB connected");
  return db;
}

// "user" is the collection created by Better Auth in the client project
export function collections() {
  return {
    users: db.collection("user"),
    services: db.collection("services"),
    appointments: db.collection("appointments"),
    transactions: db.collection("transactions"),
  };
}

export function getDb() {
  return db;
}
