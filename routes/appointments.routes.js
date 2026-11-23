import { Router } from "express";
import { collections } from "../config/db.js";
import { verifyJWT, verifyCustomer } from "../middleware/auth.js";
import { TIME_SLOTS, isValidId, toObjectId, joinAppointmentDetails } from "../utils/helpers.js";

const router = Router();

// All routes below need a valid JWT
router.use(verifyJWT);

// CUSTOMER: create an appointment request
router.post("/", verifyCustomer, async (req, res, next) => {
  try {
    const { services, appointments } = collections();
    const { serviceId, appointmentDate, timeSlot } = req.body;
    const message = String(req.body.message || "").trim().slice(0, 300);

    if (!isValidId(serviceId)) return res.status(400).json({ message: "Invalid service ID" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate || "")) {
      return res.status(400).json({ message: "Please choose a valid appointment date" });
    }
    const today = new Date().toISOString().slice(0, 10);
    if (appointmentDate < today) return res.status(400).json({ message: "Appointment date cannot be in the past" });
    if (!TIME_SLOTS.includes(timeSlot)) return res.status(400).json({ message: "Please choose a valid time slot" });

    const service = await services.findOne({ _id: toObjectId(serviceId) });
    if (!service) return res.status(404).json({ message: "Service not found" });
    if (service.status !== "active") {
      return res.status(400).json({ message: "This service is inactive and cannot be booked" });
    }

    // Prevent duplicate active appointments for the same date + time slot
    const conflict = await appointments.findOne({
      appointmentDate,
      timeSlot,
      status: { $in: ["pending", "confirmed"] },
      $or: [{ serviceId: service._id }, { customerId: req.user.dbId }],
    });
    if (conflict) {
      return res.status(409).json({
        message: "This time slot is already booked. Please choose another date or time.",
      });
    }

    const result = await appointments.insertOne({
      serviceId: service._id,
      customerId: req.user.dbId,
      appointmentDate,
      timeSlot,
      message,
      servicePrice: service.price,
      paymentStatus: "unpaid",
      status: "pending",
      createdAt: new Date(),
    });
    res.status(201).json({ message: "Appointment request sent! We will confirm it soon.", id: result.insertedId });
  } catch (error) {
    next(error);
  }
});

// CUSTOMER: my appointments
router.get("/my", verifyCustomer, async (req, res, next) => {
  try {
    const { appointments } = collections();
    const list = await appointments
      .aggregate([
        { $match: { customerId: req.user.dbId } },
        { $sort: { createdAt: -1 } },
        ...joinAppointmentDetails,
      ])
      .toArray();
    res.json(list);
  } catch (error) {
    next(error);
  }
});

// CUSTOMER: dashboard numbers
router.get("/my/stats", verifyCustomer, async (req, res, next) => {
  try {
    const { appointments } = collections();
    const rows = await appointments
      .aggregate([{ $match: { customerId: req.user.dbId } }, { $group: { _id: "$status", count: { $sum: 1 } } }])
      .toArray();
    const get = (s) => rows.find((r) => r._id === s)?.count || 0;
    const pending = get("pending");
    const confirmed = get("confirmed");
    const cancelled = get("cancelled");
    res.json({ total: pending + confirmed + cancelled, pending, confirmed, cancelled });
  } catch (error) {
    next(error);
  }
});

// CUSTOMER (own) or ADMIN: one appointment
router.get("/:id", async (req, res, next) => {
  try {
    const { appointments } = collections();
    if (!isValidId(req.params.id)) return res.status(400).json({ message: "Invalid appointment ID" });

    const match = { _id: toObjectId(req.params.id) };
    if (req.user.role !== "admin") match.customerId = req.user.dbId; // customers see only their own
    const [appointment] = await appointments.aggregate([{ $match: match }, ...joinAppointmentDetails]).toArray();
    if (!appointment) return res.status(404).json({ message: "Appointment not found" });
    res.json(appointment);
  } catch (error) {
    next(error);
  }
});

// CUSTOMER: cancel own pending appointment
router.patch("/:id/cancel", verifyCustomer, async (req, res, next) => {
  try {
    const { appointments } = collections();
    if (!isValidId(req.params.id)) return res.status(400).json({ message: "Invalid appointment ID" });

    const appointment = await appointments.findOne({
      _id: toObjectId(req.params.id),
      customerId: req.user.dbId,
    });
    if (!appointment) return res.status(404).json({ message: "Appointment not found" });
    if (appointment.status !== "pending") {
      return res.status(400).json({ message: "Only pending appointments can be cancelled" });
    }

    await appointments.updateOne({ _id: appointment._id }, { $set: { status: "cancelled" } });
    res.json({ message: "Appointment cancelled" });
  } catch (error) {
    next(error);
  }
});

export default router;
