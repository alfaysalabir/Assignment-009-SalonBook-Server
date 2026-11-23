import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB } from "./config/db.js";
import servicesRoutes from "./routes/services.routes.js";
import appointmentsRoutes from "./routes/appointments.routes.js";
import paymentsRoutes, { stripeWebhook } from "./routes/payments.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import uploadRoutes from "./routes/upload.routes.js";

const app = express();
const PORT = process.env.PORT || 5000;

// make sure MongoDB is connected before any route runs
const ensureDB = async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    next(error);
  }
};

// Stripe webhook MUST come before express.json() because it needs the raw body
app.post("/api/webhooks/stripe", express.raw({ type: "application/json" }), ensureDB, stripeWebhook);

app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(ensureDB);

app.get("/", (req, res) => res.json({ message: "SalonBook API is running" }));
app.use("/api/services", servicesRoutes);
app.use("/api/appointments", appointmentsRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/upload", uploadRoutes);

// 404 for unknown API routes
app.use((req, res) => res.status(404).json({ message: "Route not found" }));

// Central error handler
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || (err.name === "MulterError" ? 400 : 500);
  res.status(status).json({ message: status === 500 ? "Something went wrong on the server" : err.message });
});

// Vercel runs the app as a function, so only listen when running locally
if (!process.env.VERCEL) {
  app.listen(PORT, () => console.log(`SalonBook server running on port ${PORT}`));
}

export default app;
