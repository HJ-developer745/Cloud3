require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./src/models/User");

async function run() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI missing");
  await mongoose.connect(process.env.MONGODB_URI);

  const adminEmail = (process.env.ADMIN_EMAIL || "admin@example.com").toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || "ChangeMe123!";
  const demoEmail = (process.env.DEMO_EMAIL || "demo@example.com").toLowerCase();
  const demoPassword = process.env.DEMO_PASSWORD || "Demo123!";

  await User.updateOne(
    { email: adminEmail },
    {
      $setOnInsert: {
        name: "Administrator",
        email: adminEmail,
        passwordHash: await bcrypt.hash(adminPassword, 12),
        role: "admin"
      }
    },
    { upsert: true }
  );

  await User.updateOne(
    { email: demoEmail },
    {
      $setOnInsert: {
        name: "Demo User",
        email: demoEmail,
        passwordHash: await bcrypt.hash(demoPassword, 12),
        role: "user"
      }
    },
    { upsert: true }
  );

  console.log("Seed complete");
  console.log(`Admin: ${adminEmail}`);
  console.log(`Demo: ${demoEmail}`);
  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
