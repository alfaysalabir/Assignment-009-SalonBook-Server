// Adds sample services so the site is not empty. Run once: npm run seed
import "dotenv/config";
import { MongoClient } from "mongodb";

const img = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=80`;
const hair = img("photo-1560066984-138dadb4c035");
const hair2 = img("photo-1522337360788-8b13dee7a37e");
const nails = img("photo-1604654894610-df63bc536371");
const spa = img("photo-1519823551278-64ac92734fb1");
const makeup = img("photo-1487412947147-5cebf100ffc2");
const facial = img("photo-1570172619644-dfd03ed5d881");

const samples = [
  ["Signature Cut & Blow-dry", "Haircut & Styling", "A tailored haircut with a relaxing wash, precision cut and a smooth professional blow-dry.", 45, 60, hair],
  ["Bridal Hair Styling", "Haircut & Styling", "Elegant updos and soft waves styled for your big day, including a trial-friendly consultation.", 120, 120, hair2],
  ["Balayage Colour", "Hair Coloring", "Hand-painted highlights for a natural, sun-kissed finish with a gloss and toner included.", 150, 180, hair2],
  ["Root Touch-up", "Hair Coloring", "Fresh colour at the roots to keep your shade seamless between full colouring sessions.", 60, 75, hair],
  ["Keratin Smoothing Treatment", "Hair Treatment", "A smoothing treatment that reduces frizz and leaves hair silky and shiny for weeks.", 130, 150, hair],
  ["Deep Repair Hair Spa", "Hair Treatment", "Nourishing mask, scalp massage and steam to bring dry, damaged hair back to life.", 55, 60, spa],
  ["Hydrating Glow Facial", "Facial & Skincare", "Deep cleanse, exfoliation and hydrating mask to leave your skin fresh and radiant.", 70, 60, facial],
  ["Anti-Acne Skin Therapy", "Facial & Skincare", "A gentle, targeted facial that clears pores and calms breakouts using skin-safe products.", 65, 60, facial],
  ["Evening Glam Makeup", "Makeup", "Full-face makeup for parties and events, with lashes and a long-lasting finish.", 80, 75, makeup],
  ["Gel Manicure", "Manicure & Pedicure", "Nail shaping, cuticle care and a chip-free gel polish in the colour of your choice.", 35, 45, nails],
  ["Luxury Spa Pedicure", "Manicure & Pedicure", "Warm soak, scrub, massage and polish for soft, beautiful feet.", 50, 60, nails],
  ["Aromatherapy Massage", "Spa & Massage", "A calming full-body massage with warm essential oils to melt away tension and stress.", 90, 90, spa],
];

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const services = client.db(process.env.DB_NAME || "salonbook").collection("services");

if ((await services.countDocuments()) > 0) {
  console.log("Services already exist - nothing was added.");
} else {
  await services.insertMany(
    samples.map(([serviceName, category, description, price, duration, image]) => ({
      serviceName, category, description, price, duration, image, status: "active", createdAt: new Date(),
    }))
  );
  console.log(`✅ Added ${samples.length} sample services`);
}
await client.close();
