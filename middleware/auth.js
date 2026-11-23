import { createRemoteJWKSet, jwtVerify } from "jose";
import { ObjectId } from "mongodb";
import { collections } from "../config/db.js";

let jwks;
// The client (Better Auth) publishes its public keys at /api/auth/jwks
function getJWKS() {
  if (!jwks) jwks = createRemoteJWKSet(new URL(`${process.env.CLIENT_URL}/api/auth/jwks`));
  return jwks;
}

async function findUserById(id) {
  const { users } = collections();
  let user = null;
  if (/^[a-f\d]{24}$/i.test(id)) user = await users.findOne({ _id: new ObjectId(id) });
  if (!user) user = await users.findOne({ _id: id });
  return user;
}

// 1) Verify the JWT, 2) load the REAL user from MongoDB (role + blocked status come from the DB, not from the token)
export async function verifyJWT(req, res, next) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized: token is missing" });
  }

  try {
    const token = header.split(" ")[1];
    const { payload } = await jwtVerify(token, getJWKS(), {
      issuer: process.env.CLIENT_URL,
      audience: process.env.CLIENT_URL,
    });

    const user = await findUserById(payload.sub);
    if (!user) return res.status(401).json({ message: "Unauthorized: user not found" });
    if (user.isBlocked) return res.status(403).json({ message: "Your account has been blocked" });

    req.user = {
      dbId: user._id, // raw value from MongoDB (used for references)
      id: String(user._id),
      name: user.name,
      email: user.email,
      image: user.image,
      role: user.role || "customer",
    };
    next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized: invalid or expired token" });
  }
}

export function verifyAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Forbidden: admin access only" });
  }
  next();
}

export function verifyCustomer(req, res, next) {
  if (req.user?.role === "admin") {
    return res.status(403).json({ message: "Admins cannot use customer features" });
  }
  next();
}
