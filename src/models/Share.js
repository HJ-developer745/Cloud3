const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  file: { type: mongoose.Schema.Types.ObjectId, ref: "File", required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  token: { type: String, required: true, unique: true, index: true },
  permission: { type: String, enum: ["viewer", "editor"], default: "viewer" },
  publicLink: { type: Boolean, default: true },
  expiresAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model("Share", schema);
