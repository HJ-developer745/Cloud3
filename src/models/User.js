const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ["user", "admin"], default: "user" },
  storageUsed: { type: Number, default: 0 },
  storageQuota: { type: Number, default: Number(process.env.STORAGE_QUOTA || 16106127360) }
}, { timestamps: true });

module.exports = mongoose.model("User", schema);
