import { ObjectId } from "mongodb";

export const CATEGORIES = [
  "Haircut & Styling",
  "Hair Coloring",
  "Hair Treatment",
  "Facial & Skincare",
  "Makeup",
  "Manicure & Pedicure",
  "Spa & Massage",
];

export const TIME_SLOTS = [
  "09:00 AM",
  "10:00 AM",
  "11:00 AM",
  "12:00 PM",
  "02:00 PM",
  "03:00 PM",
  "04:00 PM",
  "05:00 PM",
  "06:00 PM",
];

export const isValidId = (id) => typeof id === "string" && /^[a-f\d]{24}$/i.test(id);
export const toObjectId = (id) => new ObjectId(id);
export const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Checks the body of "add service" / "update service" requests
export function validateService(body = {}) {
  const serviceName = String(body.serviceName || "").trim();
  const category = String(body.category || "").trim();
  const description = String(body.description || "").trim();
  const image = String(body.image || "").trim();
  const status = body.status === "inactive" ? "inactive" : "active";
  const price = Number(body.price);
  const duration = Number(body.duration);

  if (serviceName.length < 3) return { error: "Service name must be at least 3 characters" };
  if (!CATEGORIES.includes(category)) return { error: "Please choose a valid category" };
  if (description.length < 10) return { error: "Description must be at least 10 characters" };
  if (!Number.isFinite(price) || price <= 0) return { error: "Price must be a positive number" };
  if (!Number.isFinite(duration) || duration <= 0) return { error: "Duration must be a positive number" };
  if (!image) return { error: "Service image is required" };

  return { value: { serviceName, category, description, price, duration, image, status } };
}

// Aggregation steps that attach the service + customer to appointments
export const joinAppointmentDetails = [
  { $lookup: { from: "services", localField: "serviceId", foreignField: "_id", as: "service" } },
  { $unwind: { path: "$service", preserveNullAndEmptyArrays: true } },
  { $lookup: { from: "user", localField: "customerId", foreignField: "_id", as: "customer" } },
  { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },
  {
    $addFields: {
      customer: {
        _id: "$customer._id",
        name: "$customer.name",
        email: "$customer.email",
        image: "$customer.image",
        phone: "$customer.phone",
      },
    },
  },
];
