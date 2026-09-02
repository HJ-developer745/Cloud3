const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  action: { type: String, required: true },
  file: { type: mongoose.Schema.Types.ObjectId, ref: "File", default: null },
  folder: { type: mongoose.Schema.Types.ObjectId, ref: "Folder", default: null }
}, { timestamps: true });

module.exports = mongoose.model("Activity", schema);
