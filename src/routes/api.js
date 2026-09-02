const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const User = require("../models/User");
const File = require("../models/File");
const Folder = require("../models/Folder");
const Share = require("../models/Share");
const Activity = require("../models/Activity");
const { auth, admin } = require("../middleware/auth");

const router = express.Router();
const STORAGE_DIR = path.join(__dirname, "..", "..", "storage", "users");
fs.mkdirSync(STORAGE_DIR, { recursive: true });

const maxSize = Number(process.env.MAX_FILE_SIZE || 524288000);

const upload = multer({
  dest: STORAGE_DIR,
  limits: { fileSize: maxSize }
});

const ok = (res, data = {}, message = "OK") =>
  res.json({ success: true, message, data });

function safeName(name) {
  return String(name || "file").replace(/[\/\\:*?"<>|]/g, "_").slice(0, 255) || "file";
}

function sign(user) {
  return jwt.sign({ id: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

async function logActivity(user, action, file = null, folder = null) {
  await Activity.create({ user: user._id, action, file, folder });
}

router.post("/auth/register", async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password || password.length < 6) {
      return res.status(400).json({ success: false, message: "Name, email and a password of at least 6 characters are required" });
    }

    const normalized = email.toLowerCase().trim();
    if (await User.exists({ email: normalized })) {
      return res.status(409).json({ success: false, message: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email: normalized, passwordHash });

    res.cookie("clouddrive_token", sign(user), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    ok(res, { user: { id: user._id, name: user.name, email: user.email, role: user.role } }, "Account created");
  } catch (e) {
    next(e);
  }
});

router.post("/auth/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: String(email || "").toLowerCase().trim() });

    if (!user || !(await bcrypt.compare(password || "", user.passwordHash))) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    res.cookie("clouddrive_token", sign(user), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    ok(res, { user: { id: user._id, name: user.name, email: user.email, role: user.role } }, "Logged in");
  } catch (e) {
    next(e);
  }
});

router.post("/auth/logout", (req, res) => {
  res.clearCookie("clouddrive_token");
  ok(res, {}, "Logged out");
});

router.get("/users/me", auth, async (req, res) => {
  ok(res, { user: req.user });
});

router.get("/files", auth, async (req, res, next) => {
  try {
    const folder = req.query.folder || null;
    const starred = req.query.starred === "true";

    const [files, folders] = await Promise.all([
      File.find({
        owner: req.user._id,
        folder,
        trashed: false,
        ...(starred ? { starred: true } : {})
      }).sort({ createdAt: -1 }),
      starred
        ? []
        : Folder.find({ owner: req.user._id, parent: folder, trashed: false }).sort({ name: 1 })
    ]);

    ok(res, { files, folders });
  } catch (e) {
    next(e);
  }
});

router.post("/files/upload", auth, upload.array("files", 20), async (req, res, next) => {
  try {
    const folder = req.body.folder || null;
    if (folder) {
      const exists = await Folder.exists({ _id: folder, owner: req.user._id, trashed: false });
      if (!exists) return res.status(400).json({ success: false, message: "Folder not found" });
    }

    const incoming = req.files || [];
    const total = incoming.reduce((n, f) => n + f.size, 0);
    if (req.user.storageUsed + total > req.user.storageQuota) {
      for (const f of incoming) fs.rmSync(f.path, { force: true });
      return res.status(413).json({ success: false, message: "Storage quota exceeded" });
    }

    const docs = [];
    for (const f of incoming) {
      const finalName = safeName(f.originalname);
      const userDir = path.join(STORAGE_DIR, req.user._id.toString());
      fs.mkdirSync(userDir, { recursive: true });
      const finalPath = path.join(userDir, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}-${finalName}`);
      fs.renameSync(f.path, finalPath);

      docs.push({
        owner: req.user._id,
        folder,
        name: finalName,
        originalName: f.originalname,
        mimeType: f.mimetype,
        size: f.size,
        storagePath: finalPath
      });
    }

    const created = await File.insertMany(docs);
    req.user.storageUsed += total;
    await req.user.save();

    for (const f of created) await logActivity(req.user, "uploaded", f._id);
    ok(res, { files: created }, `${created.length} file(s) uploaded`);
  } catch (e) {
    if (req.files) for (const f of req.files) fs.rmSync(f.path, { force: true });
    next(e);
  }
});

router.get("/files/:id/download", auth, async (req, res, next) => {
  try {
    const file = await File.findOne({ _id: req.params.id, owner: req.user._id, trashed: false });
    if (!file || !fs.existsSync(file.storagePath)) return res.status(404).json({ success: false, message: "File not found" });
    res.download(file.storagePath, file.name);
  } catch (e) {
    next(e);
  }
});

router.get("/files/:id/preview", auth, async (req, res, next) => {
  try {
    const file = await File.findOne({ _id: req.params.id, owner: req.user._id, trashed: false });
    if (!file || !fs.existsSync(file.storagePath)) return res.status(404).json({ success: false, message: "File not found" });
    res.type(file.mimeType || "application/octet-stream");
    fs.createReadStream(file.storagePath).pipe(res);
  } catch (e) {
    next(e);
  }
});

router.patch("/files/:id", auth, async (req, res, next) => {
  try {
    const file = await File.findOne({ _id: req.params.id, owner: req.user._id, trashed: false });
    if (!file) return res.status(404).json({ success: false, message: "File not found" });

    if (typeof req.body.name === "string" && req.body.name.trim()) file.name = safeName(req.body.name.trim());
    if (typeof req.body.starred === "boolean") file.starred = req.body.starred;
    await file.save();

    ok(res, { file }, "File updated");
  } catch (e) {
    next(e);
  }
});

router.delete("/files/:id", auth, async (req, res, next) => {
  try {
    const file = await File.findOne({ _id: req.params.id, owner: req.user._id, trashed: false });
    if (!file) return res.status(404).json({ success: false, message: "File not found" });

    file.trashed = true;
    file.trashedAt = new Date();
    await file.save();
    await logActivity(req.user, "moved to trash", file._id);

    ok(res, {}, "File moved to trash");
  } catch (e) {
    next(e);
  }
});

router.post("/folders", auth, async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();
    const parent = req.body.parent || null;
    if (!name) return res.status(400).json({ success: false, message: "Folder name is required" });

    if (parent) {
      const exists = await Folder.exists({ _id: parent, owner: req.user._id, trashed: false });
      if (!exists) return res.status(400).json({ success: false, message: "Parent folder not found" });
    }

    const folder = await Folder.create({ owner: req.user._id, parent, name: safeName(name) });
    await logActivity(req.user, "created folder", null, folder._id);
    ok(res, { folder }, "Folder created");
  } catch (e) {
    next(e);
  }
});

router.patch("/folders/:id", auth, async (req, res, next) => {
  try {
    const folder = await Folder.findOne({ _id: req.params.id, owner: req.user._id, trashed: false });
    if (!folder) return res.status(404).json({ success: false, message: "Folder not found" });

    if (typeof req.body.name === "string" && req.body.name.trim()) folder.name = safeName(req.body.name.trim());
    await folder.save();
    ok(res, { folder }, "Folder updated");
  } catch (e) {
    next(e);
  }
});

router.delete("/folders/:id", auth, async (req, res, next) => {
  try {
    const folder = await Folder.findOne({ _id: req.params.id, owner: req.user._id, trashed: false });
    if (!folder) return res.status(404).json({ success: false, message: "Folder not found" });

    folder.trashed = true;
    await folder.save();
    await File.updateMany({ owner: req.user._id, folder: folder._id, trashed: false }, { $set: { trashed: true, trashedAt: new Date() } });
    await logActivity(req.user, "moved folder to trash", null, folder._id);

    ok(res, {}, "Folder moved to trash");
  } catch (e) {
    next(e);
  }
});

router.get("/search", auth, async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return ok(res, { files: [] });

    const files = await File.find({
      owner: req.user._id,
      trashed: false,
      name: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" }
    }).sort({ updatedAt: -1 }).limit(100);

    ok(res, { files });
  } catch (e) {
    next(e);
  }
});

router.get("/activity", auth, async (req, res, next) => {
  try {
    const activity = await Activity.find({ user: req.user._id })
      .populate("file", "name")
      .sort({ createdAt: -1 })
      .limit(50);

    ok(res, { activity });
  } catch (e) {
    next(e);
  }
});

router.get("/trash", auth, async (req, res, next) => {
  try {
    const files = await File.find({ owner: req.user._id, trashed: true }).sort({ trashedAt: -1 });
    ok(res, { files });
  } catch (e) {
    next(e);
  }
});

router.delete("/trash/empty", auth, async (req, res, next) => {
  try {
    const files = await File.find({ owner: req.user._id, trashed: true });

    let freed = 0;
    for (const file of files) {
      freed += file.size;
      fs.rmSync(file.storagePath, { force: true });
    }

    await File.deleteMany({ owner: req.user._id, trashed: true });
    req.user.storageUsed = Math.max(0, req.user.storageUsed - freed);
    await req.user.save();

    ok(res, {}, "Trash emptied");
  } catch (e) {
    next(e);
  }
});

router.get("/storage", auth, async (req, res, next) => {
  try {
    const largest = await File.find({ owner: req.user._id, trashed: false })
      .sort({ size: -1 })
      .limit(10)
      .select("name size mimeType");

    const quota = req.user.storageQuota || Number(process.env.STORAGE_QUOTA || 16106127360);
    const used = req.user.storageUsed || 0;
    const percentage = Math.min(100, Number(((used / quota) * 100).toFixed(1)));

    ok(res, { used, quota, percentage, largest });
  } catch (e) {
    next(e);
  }
});

router.post("/files/:id/share", auth, async (req, res, next) => {
  try {
    const file = await File.findOne({ _id: req.params.id, owner: req.user._id, trashed: false });
    if (!file) return res.status(404).json({ success: false, message: "File not found" });

    const token = crypto.randomBytes(24).toString("hex");
    const share = await Share.create({
      file: file._id,
      owner: req.user._id,
      token,
      permission: req.body.permission === "editor" ? "editor" : "viewer",
      publicLink: req.body.publicLink !== false
    });

    const base = `${req.protocol}://${req.get("host")}`;
    ok(res, { share, link: `${base}/shared.html?token=${token}` }, "Share link created");
  } catch (e) {
    next(e);
  }
});

router.get("/public/share/:token", async (req, res, next) => {
  try {
    const share = await Share.findOne({ token: req.params.token, publicLink: true }).populate("file");
    if (!share || !share.file || share.file.trashed) {
      return res.status(404).json({ success: false, message: "Share not found" });
    }

    ok(res, {
      file: {
        id: share.file._id,
        name: share.file.name,
        size: share.file.size,
        mimeType: share.file.mimeType
      }
    });
  } catch (e) {
    next(e);
  }
});

router.get("/public/share/:token/download", async (req, res, next) => {
  try {
    const share = await Share.findOne({ token: req.params.token }).populate("file");
    if (!share || !share.file || share.file.trashed || !share.publicLink) {
      return res.status(404).json({ success: false, message: "Share not found" });
    }
    if (!fs.existsSync(share.file.storagePath)) {
      return res.status(404).json({ success: false, message: "File unavailable" });
    }
    res.download(share.file.storagePath, share.file.name);
  } catch (e) {
    next(e);
  }
});

router.get("/admin/stats", auth, admin, async (req, res, next) => {
  try {
    const [users, files, shared, deleted, agg] = await Promise.all([
      User.countDocuments(),
      File.countDocuments({ trashed: false }),
      Share.countDocuments(),
      File.countDocuments({ trashed: true }),
      File.aggregate([
        { $match: { trashed: false } },
        { $group: { _id: null, size: { $sum: "$size" } } }
      ])
    ]);

    ok(res, {
      totalUsers: users,
      totalFiles: files,
      totalStorageUsed: agg[0]?.size || 0,
      sharedFiles: shared,
      deletedFiles: deleted
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
