require("dotenv").config();
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const multer = require("multer");

const { pool, init } = require("./db");
const r2 = require("./r2");

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "pilar2026";
const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(16).toString("hex");

const app = express();
app.use(express.json());
app.use(cookieParser());

// Subida en memoria, solo imágenes, hasta 10 MB.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error("Solo se permiten imágenes"));
  },
});

/* ====== AUTENTICACIÓN ADMIN (cookie firmada, una sola contraseña) ====== */
function makeToken() {
  return crypto.createHmac("sha256", SESSION_SECRET).update("admin-ok").digest("hex");
}
function isAdmin(req) {
  return req.cookies && req.cookies.admin === makeToken();
}
function requireAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  res.status(401).json({ error: "No autorizado" });
}

app.post("/api/admin/login", (req, res) => {
  const { password } = req.body || {};
  if (password && password === ADMIN_PASSWORD) {
    res.cookie("admin", makeToken(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });
    return res.json({ ok: true });
  }
  res.status(401).json({ error: "Contraseña incorrecta" });
});

app.post("/api/admin/logout", (req, res) => {
  res.clearCookie("admin");
  res.json({ ok: true });
});

app.get("/api/admin/session", (req, res) => {
  res.json({ admin: isAdmin(req) });
});

/* ====== FOTOS (recuerdos con imagen) ====== */
app.get("/api/photos", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, name, caption, image_url, created_at FROM photos ORDER BY created_at DESC"
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "No se pudieron cargar las fotos" });
  }
});

app.post("/api/photos", upload.single("image"), async (req, res) => {
  try {
    const name = (req.body.name || "").trim();
    const caption = (req.body.caption || "").trim();
    if (!name) return res.status(400).json({ error: "Falta el nombre" });
    if (!req.file) return res.status(400).json({ error: "Falta la imagen" });
    if (!r2.isConfigured)
      return res.status(503).json({ error: "Almacenamiento de imágenes no configurado" });

    const { key, url } = await r2.uploadImage(req.file.buffer, req.file.mimetype);
    const { rows } = await pool.query(
      "INSERT INTO photos (name, caption, image_url, image_key) VALUES ($1,$2,$3,$4) RETURNING id, name, caption, image_url, created_at",
      [name.slice(0, 80), caption.slice(0, 200), url, key]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "No se pudo subir la foto" });
  }
});

app.delete("/api/admin/photos/:id", requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "DELETE FROM photos WHERE id=$1 RETURNING image_key",
      [req.params.id]
    );
    if (rows[0]) await r2.deleteImage(rows[0].image_key).catch(() => {});
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "No se pudo borrar" });
  }
});

/* ====== MENSAJES / FRASES PARA PILI ====== */
app.get("/api/messages", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, name, message, created_at FROM messages ORDER BY created_at DESC"
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "No se pudieron cargar los mensajes" });
  }
});

app.post("/api/messages", async (req, res) => {
  try {
    const name = (req.body.name || "").trim();
    const message = (req.body.message || "").trim();
    if (!name) return res.status(400).json({ error: "Falta el nombre" });
    if (!message) return res.status(400).json({ error: "Falta el mensaje" });
    const { rows } = await pool.query(
      "INSERT INTO messages (name, message) VALUES ($1,$2) RETURNING id, name, message, created_at",
      [name.slice(0, 80), message.slice(0, 500)]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "No se pudo guardar el mensaje" });
  }
});

app.delete("/api/admin/messages/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM messages WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "No se pudo borrar" });
  }
});

/* ====== CONFIRMACIONES (RSVP) ====== */
app.post("/api/rsvps", async (req, res) => {
  try {
    const name = (req.body.name || "").trim();
    const attending = (req.body.attending || "").trim();
    let guests = parseInt(req.body.guests, 10);
    if (!Number.isFinite(guests) || guests < 1) guests = 1;
    if (!name) return res.status(400).json({ error: "Falta el nombre" });
    const { rows } = await pool.query(
      "INSERT INTO rsvps (name, attending, guests) VALUES ($1,$2,$3) RETURNING id",
      [name.slice(0, 80), attending.slice(0, 80) || "Sin especificar", guests]
    );
    res.status(201).json({ ok: true, id: rows[0].id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "No se pudo guardar la confirmación" });
  }
});

app.get("/api/admin/rsvps", requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, name, attending, guests, created_at FROM rsvps ORDER BY created_at DESC"
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "No se pudieron cargar las confirmaciones" });
  }
});

app.delete("/api/admin/rsvps/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM rsvps WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "No se pudo borrar" });
  }
});

/* ====== PÁGINAS Y ARCHIVOS ESTÁTICOS ====== */
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "admin.html")));
app.get("/muro", (req, res) => res.sendFile(path.join(__dirname, "muro.html")));
app.use(express.static(__dirname, { extensions: ["html"] }));

// Manejo de errores de multer (tamaño, tipo de archivo)
app.use((err, req, res, next) => {
  if (err) return res.status(400).json({ error: err.message || "Error" });
  next();
});

init()
  .catch((e) => console.error("[db] Error inicializando tablas:", e.message))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`Invitación de Pilar escuchando en el puerto ${PORT}`);
    });
  });
