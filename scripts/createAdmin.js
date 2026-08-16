// One-off script to create (or promote) an admin account.
// Run locally or from Render's Shell tab:
//   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=strongpassword ADMIN_PHONE=9999999999 node scripts/createAdmin.js
//
// Reads MONGO_URI from your .env / Render environment, same as index.js.

require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const phone = process.env.ADMIN_PHONE || "0000000000";
  const name = process.env.ADMIN_NAME || "Admin";

  if (!email || !password) {
    console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD environment variables before running this script.");
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("ADMIN_PASSWORD must be at least 8 characters.");
    process.exit(1);
  }

  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set. Make sure your .env file (or shell env) has it.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const cleanEmail = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);

  const existing = await User.findOne({ email: cleanEmail });

  if (existing) {
    existing.password = passwordHash;
    existing.role = "admin";
    existing.name = name;
    await existing.save();
    console.log(`Updated existing user "${cleanEmail}" and set role to admin.`);
  } else {
    await User.create({
      name,
      email: cleanEmail,
      phone,
      password: passwordHash,
      role: "admin"
    });
    console.log(`Created new admin user "${cleanEmail}".`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to create admin:", err);
  process.exit(1);
});