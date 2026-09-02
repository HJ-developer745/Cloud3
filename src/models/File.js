const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  folder: { type: mongoose.Schema.Types.ObjectId, ref: "Folder", default: null, index: true },
  name: { type: String, required: true, trim: true, maxlength: 255 },
  originalName: { type: String, required: true },
  mimeType: { type: String, default: "application/octet-stream" },
  size: { type: Number, default: 0 },
  storagePath: { type: String, required: true },
  starred: { type: Boolean, default: false },
  trashed: { type: Boolean, default: false, index: true },
  trashedAt: { type: Date, default: null }
}, { timestamps: true });

schema.index({ owner: 1, name: 1 });
schema.index({ owner: 1, folder: 1, trashed: 1 });

module.exports = mongoose.model("File", schema);
