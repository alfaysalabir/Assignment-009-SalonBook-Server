import { Router } from "express";
import { collections } from "../config/db.js";
import { verifyJWT, verifyAdmin } from "../middleware/auth.js";
import {
  CATEGORIES,
  TIME_SLOTS,
  isValidId,
  toObjectId,
  escapeRegex,
  validateService,
} from "../utils/helpers.js";

const router = Router();

// PUBLIC: list active services (search, category filter, price sorting)
router.get("/", async (req, res, next) => {
  try {
    const { services } = collections();
    const { search = "", category = "", sort = "newest" } = req.query;
    const limit = Math.min(Number(req.query.limit) || 100, 100);

    const filter = { status: "active" };
    if (search.trim()) filter.serviceName = { $regex: escapeRegex(search.trim()), $options: "i" };
    if (category) filter.category = category;

    let sortBy = { createdAt: -1 };
    if (sort === "price_asc") sortBy = { price: 1 };
    if (sort === "price_desc") sortBy = { price: -1 };

    const result = await services.find(filter).sort(sortBy).limit(limit).toArray();
    res.json({ services: result, total: result.length });
  } catch (error) {
    next(error);
  }
});

// PUBLIC: categories with the number of active services in each
router.get("/categories", async (req, res, next) => {
  try {
    const { services } = collections();
    const counts = await services
      .aggregate([{ $match: { status: "active" } }, { $group: { _id: "$category", count: { $sum: 1 } } }])
      .toArray();
    const countMap = Object.fromEntries(counts.map((c) => [c._id, c.count]));
    res.json(CATEGORIES.map((name) => ({ name, count: countMap[name] || 0 })));
  } catch (error) {
    next(error);
  }
});

// PRIVATE: single service (customers only see active services)
router.get("/:id", verifyJWT, async (req, res, next) => {
  try {
    const { services } = collections();
    if (!isValidId(req.params.id)) return res.status(400).json({ message: "Invalid service ID" });

    const service = await services.findOne({ _id: toObjectId(req.params.id) });
    if (!service) return res.status(404).json({ message: "Service not found" });
    if (service.status !== "active" && req.user.role !== "admin") {
      return res.status(404).json({ message: "This service is not available right now" });
    }
    res.json(service);
  } catch (error) {
    next(error);
  }
});

// PRIVATE: which time slots are free for a date
router.get("/:id/slots", verifyJWT, async (req, res, next) => {
  try {
    const { appointments } = collections();
    const { date } = req.query;
    if (!isValidId(req.params.id)) return res.status(400).json({ message: "Invalid service ID" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return res.status(400).json({ message: "Invalid date" });

    const taken = await appointments
      .find({
        appointmentDate: date,
        status: { $in: ["pending", "confirmed"] },
        $or: [{ serviceId: toObjectId(req.params.id) }, { customerId: req.user.dbId }],
      })
      .toArray();
    const takenSlots = new Set(taken.map((a) => a.timeSlot));
    res.json(TIME_SLOTS.map((time) => ({ time, available: !takenSlots.has(time) })));
  } catch (error) {
    next(error);
  }
});

// ADMIN: add service
router.post("/", verifyJWT, verifyAdmin, async (req, res, next) => {
  try {
    const { services } = collections();
    const { error, value } = validateService(req.body);
    if (error) return res.status(400).json({ message: error });

    const result = await services.insertOne({ ...value, createdAt: new Date() });
    res.status(201).json({ message: "Service created successfully", id: result.insertedId });
  } catch (error) {
    next(error);
  }
});

// ADMIN: update service
router.put("/:id", verifyJWT, verifyAdmin, async (req, res, next) => {
  try {
    const { services } = collections();
    if (!isValidId(req.params.id)) return res.status(400).json({ message: "Invalid service ID" });
    const { error, value } = validateService(req.body);
    if (error) return res.status(400).json({ message: error });

    const result = await services.updateOne(
      { _id: toObjectId(req.params.id) },
      { $set: { ...value, updatedAt: new Date() } }
    );
    if (!result.matchedCount) return res.status(404).json({ message: "Service not found" });
    res.json({ message: "Service updated successfully" });
  } catch (error) {
    next(error);
  }
});

// ADMIN: activate / deactivate
router.patch("/:id/status", verifyJWT, verifyAdmin, async (req, res, next) => {
  try {
    const { services } = collections();
    const { status } = req.body;
    if (!isValidId(req.params.id)) return res.status(400).json({ message: "Invalid service ID" });
    if (!["active", "inactive"].includes(status)) return res.status(400).json({ message: "Invalid status" });

    const result = await services.updateOne({ _id: toObjectId(req.params.id) }, { $set: { status } });
    if (!result.matchedCount) return res.status(404).json({ message: "Service not found" });
    res.json({ message: `Service is now ${status}` });
  } catch (error) {
    next(error);
  }
});

// ADMIN: delete service
router.delete("/:id", verifyJWT, verifyAdmin, async (req, res, next) => {
  try {
    const { services, appointments } = collections();
    if (!isValidId(req.params.id)) return res.status(400).json({ message: "Invalid service ID" });
    const id = toObjectId(req.params.id);

    const activeCount = await appointments.countDocuments({
      serviceId: id,
      status: { $in: ["pending", "confirmed"] },
    });
    if (activeCount > 0) {
      return res.status(409).json({
        message: "This service has active appointments. Deactivate it instead of deleting.",
      });
    }

    const result = await services.deleteOne({ _id: id });
    if (!result.deletedCount) return res.status(404).json({ message: "Service not found" });
    res.json({ message: "Service deleted successfully" });
  } catch (error) {
    next(error);
  }
});

export default router;
