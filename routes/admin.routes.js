import { Router } from "express";
import { collections, getDb } from "../config/db.js";
import { verifyJWT, verifyAdmin } from "../middleware/auth.js";
import { isValidId, toObjectId, escapeRegex, joinAppointmentDetails } from "../utils/helpers.js";

const router = Router();

// Every admin route needs a valid JWT AND the admin role (checked in the database)
router.use(verifyJWT, verifyAdmin);

router.get("/stats", async (req, res, next) => {
  try {
    const { users, services, appointments, transactions } = collections();
    const [customers, activeServices, total, pending, confirmed, payments] = await Promise.all([
      users.countDocuments({ role: { $ne: "admin" } }),
      services.countDocuments({ status: "active" }),
      appointments.countDocuments(),
      appointments.countDocuments({ status: "pending" }),
      appointments.countDocuments({ status: "confirmed" }),
      transactions.countDocuments({ status: "paid" }),
    ]);
    const revenue = await transactions
      .aggregate([{ $match: { status: "paid" } }, { $group: { _id: null, sum: { $sum: "$amount" } } }])
      .toArray();
    res.json({
      customers,
      activeServices,
      totalAppointments: total,
      pending,
      confirmed,
      successfulPayments: payments,
      revenue: revenue[0]?.sum || 0,
    });
  } catch (error) {
    next(error);
  }
});

// All services (active + inactive)
router.get("/services", async (req, res, next) => {
  try {
    const { services } = collections();
    res.json(await services.find().sort({ createdAt: -1 }).toArray());
  } catch (error) {
    next(error);
  }
});

// ----- Appointments -----
router.get("/appointments", async (req, res, next) => {
  try {
    const { appointments } = collections();
    const list = await appointments
      .aggregate([{ $sort: { createdAt: -1 } }, ...joinAppointmentDetails])
      .toArray();
    res.json(list);
  } catch (error) {
    next(error);
  }
});

router.patch("/appointments/:id/confirm", async (req, res, next) => {
  try {
    const { appointments } = collections();
    if (!isValidId(req.params.id)) return res.status(400).json({ message: "Invalid appointment ID" });
    const appointment = await appointments.findOne({ _id: toObjectId(req.params.id) });
    if (!appointment) return res.status(404).json({ message: "Appointment not found" });
    if (appointment.status !== "pending") {
      return res.status(400).json({ message: "Only pending appointments can be confirmed" });
    }
    await appointments.updateOne({ _id: appointment._id }, { $set: { status: "confirmed" } });
    res.json({ message: "Appointment confirmed" });
  } catch (error) {
    next(error);
  }
});

router.patch("/appointments/:id/cancel", async (req, res, next) => {
  try {
    const { appointments } = collections();
    if (!isValidId(req.params.id)) return res.status(400).json({ message: "Invalid appointment ID" });
    const appointment = await appointments.findOne({ _id: toObjectId(req.params.id) });
    if (!appointment) return res.status(404).json({ message: "Appointment not found" });
    if (!["pending", "confirmed"].includes(appointment.status)) {
      return res.status(400).json({ message: "Only pending or confirmed appointments can be cancelled" });
    }
    await appointments.updateOne({ _id: appointment._id }, { $set: { status: "cancelled" } });
    res.json({ message: "Appointment cancelled" });
  } catch (error) {
    next(error);
  }
});

// ----- Users (customers) -----
router.get("/users", async (req, res, next) => {
  try {
    const { users } = collections();
    const search = String(req.query.search || "").trim();
    const filter = { role: { $ne: "admin" } };
    if (search) {
      const regex = { $regex: escapeRegex(search), $options: "i" };
      filter.$or = [{ name: regex }, { email: regex }];
    }
    res.json(await users.find(filter).sort({ createdAt: -1 }).toArray());
  } catch (error) {
    next(error);
  }
});

router.get("/users/:id", async (req, res, next) => {
  try {
    const { users, appointments } = collections();
    if (!isValidId(req.params.id)) return res.status(400).json({ message: "Invalid user ID" });
    const user = await users.findOne({ _id: toObjectId(req.params.id) });
    if (!user) return res.status(404).json({ message: "User not found" });
    const appointmentCount = await appointments.countDocuments({ customerId: user._id });
    res.json({ ...user, appointmentCount });
  } catch (error) {
    next(error);
  }
});

async function setBlocked(req, res, next, isBlocked) {
  try {
    const { users } = collections();
    if (!isValidId(req.params.id)) return res.status(400).json({ message: "Invalid user ID" });
    const user = await users.findOne({ _id: toObjectId(req.params.id) });
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role === "admin") return res.status(400).json({ message: "Admin accounts cannot be blocked" });

    await users.updateOne({ _id: user._id }, { $set: { isBlocked } });
    if (isBlocked) {
      // log the user out everywhere (Better Auth "session" collection)
      await getDb().collection("session").deleteMany({ userId: { $in: [user._id, String(user._id)] } });
    }
    res.json({ message: isBlocked ? "User blocked" : "User unblocked" });
  } catch (error) {
    next(error);
  }
}
router.patch("/users/:id/block", (req, res, next) => setBlocked(req, res, next, true));
router.patch("/users/:id/unblock", (req, res, next) => setBlocked(req, res, next, false));

// ----- Transactions (read only: payments can only be created by the Stripe webhook) -----
router.get("/transactions", async (req, res, next) => {
  try {
    const { transactions } = collections();
    const list = await transactions
      .aggregate([
        { $sort: { createdAt: -1 } },
        { $lookup: { from: "appointments", localField: "appointmentId", foreignField: "_id", as: "appointment" } },
        { $unwind: { path: "$appointment", preserveNullAndEmptyArrays: true } },
        { $lookup: { from: "services", localField: "appointment.serviceId", foreignField: "_id", as: "service" } },
        { $unwind: { path: "$service", preserveNullAndEmptyArrays: true } },
        { $lookup: { from: "user", localField: "customerId", foreignField: "_id", as: "customer" } },
        { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            customer: { name: "$customer.name", email: "$customer.email", image: "$customer.image" },
          },
        },
      ])
      .toArray();
    res.json(list);
  } catch (error) {
    next(error);
  }
});

export default router;
