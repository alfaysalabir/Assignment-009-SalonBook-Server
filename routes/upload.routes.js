import { Router } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";

const router = Router();

// Keep the file in memory (max 5MB) and only accept images
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

// Public (needed on the sign up page) but limited to stop abuse
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { message: "Too many uploads, try again later" } });

// The ImgBB API key stays on the server, it is never sent to the browser
router.post("/", limiter, upload.single("image"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Please choose an image" });

    const body = new URLSearchParams();
    body.append("image", req.file.buffer.toString("base64"));

    const response = await fetch(`https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`, {
      method: "POST",
      body,
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      return res.status(502).json({ message: "Image upload failed. Please try again." });
    }
    res.json({ url: data.data.url });
  } catch (error) {
    next(error);
  }
});

export default router;
