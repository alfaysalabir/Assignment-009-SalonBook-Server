import { Router } from "express";
import Stripe from "stripe";
import { collections } from "../config/db.js";
import { verifyJWT, verifyCustomer } from "../middleware/auth.js";
import { isValidId, toObjectId } from "../utils/helpers.js";

const router = Router();

let stripe;
function getStripe() {
  if (!stripe) stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripe;
}

// CUSTOMER: start Stripe Checkout for a CONFIRMED + UNPAID appointment
router.post("/checkout-session", verifyJWT, verifyCustomer, async (req, res, next) => {
  try {
    const { appointments, services } = collections();
    const { appointmentId } = req.body;
    if (!isValidId(appointmentId)) return res.status(400).json({ message: "Invalid appointment ID" });

    const appointment = await appointments.findOne({
      _id: toObjectId(appointmentId),
      customerId: req.user.dbId,
    });
    if (!appointment) return res.status(404).json({ message: "Appointment not found" });
    if (appointment.status !== "confirmed") {
      return res.status(400).json({ message: "You can only pay for confirmed appointments" });
    }
    if (appointment.paymentStatus === "paid") {
      return res.status(400).json({ message: "This appointment is already paid" });
    }

    const service = await services.findOne({ _id: appointment.serviceId });
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      customer_email: req.user.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: process.env.CURRENCY || "usd",
            unit_amount: Math.round(appointment.servicePrice * 100), // Stripe uses the smallest unit (cents)
            product_data: {
              name: service?.serviceName || "Salon appointment",
              description: `${appointment.appointmentDate} at ${appointment.timeSlot}`,
            },
          },
        },
      ],
      metadata: { appointmentId: String(appointment._id), customerId: req.user.id },
      success_url: `${process.env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/payment/cancel`,
    });

    res.json({ url: session.url });
  } catch (error) {
    next(error);
  }
});

// CUSTOMER: info for the success page. It only READS data - it never marks anything as paid.
router.get("/session/:sessionId", verifyJWT, verifyCustomer, async (req, res, next) => {
  try {
    const { appointments } = collections();
    const session = await getStripe().checkout.sessions.retrieve(req.params.sessionId);
    if (session.metadata?.customerId !== req.user.id) {
      return res.status(403).json({ message: "This payment does not belong to you" });
    }
    const appointment = await appointments.findOne({ _id: toObjectId(session.metadata.appointmentId) });
    res.json({
      amount: (session.amount_total || 0) / 100,
      currency: session.currency,
      stripePaymentStatus: session.payment_status,
      appointmentId: session.metadata.appointmentId,
      // This value is changed ONLY by the verified webhook
      appointmentPaymentStatus: appointment?.paymentStatus || "unpaid",
    });
  } catch (error) {
    next(error);
  }
});

// CUSTOMER: payment history
router.get("/my", verifyJWT, verifyCustomer, async (req, res, next) => {
  try {
    const { transactions } = collections();
    const list = await transactions
      .aggregate([
        { $match: { customerId: req.user.dbId } },
        { $sort: { createdAt: -1 } },
        { $lookup: { from: "appointments", localField: "appointmentId", foreignField: "_id", as: "appointment" } },
        { $unwind: { path: "$appointment", preserveNullAndEmptyArrays: true } },
        { $lookup: { from: "services", localField: "appointment.serviceId", foreignField: "_id", as: "service" } },
        { $unwind: { path: "$service", preserveNullAndEmptyArrays: true } },
      ])
      .toArray();
    res.json(list);
  } catch (error) {
    next(error);
  }
});

// STRIPE WEBHOOK: the ONLY place where paymentStatus becomes "paid"
// (mounted in index.js with express.raw so the signature can be verified)
export async function stripeWebhook(req, res) {
  let event;
  try {
    event = getStripe().webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    console.error("Webhook signature failed:", error.message);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    const { appointments, transactions } = collections();
    const session = event.data.object;

    const isPaid =
      ["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type) &&
      session.payment_status === "paid";
    const isFailed = event.type === "checkout.session.async_payment_failed";

    if ((isPaid || isFailed) && isValidId(session.metadata?.appointmentId || "")) {
      const appointment = await appointments.findOne({ _id: toObjectId(session.metadata.appointmentId) });

      if (appointment) {
        // upsert + unique index = the same event can arrive twice without creating two transactions
        await transactions.updateOne(
          { stripeSessionId: session.id },
          {
            $set: {
              appointmentId: appointment._id,
              customerId: appointment.customerId,
              amount: (session.amount_total || 0) / 100,
              currency: session.currency,
              status: isPaid ? "paid" : "failed",
            },
            $setOnInsert: { createdAt: new Date() },
          },
          { upsert: true }
        );
        if (isPaid) {
          await appointments.updateOne({ _id: appointment._id }, { $set: { paymentStatus: "paid" } });
        }
      }
    }
    res.json({ received: true });
  } catch (error) {
    console.error("Webhook handler error:", error);
    res.status(500).json({ message: "Webhook handler failed" });
  }
}

export default router;
