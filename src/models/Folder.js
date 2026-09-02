const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  parent: { type: mongoose.Schema.Types.ObjectId, ref: "Folder", default: null, index: true },
  name: { type: String, required: true, trim: true, maxlength: 255 },
  trashed: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model("Folder", schema);
