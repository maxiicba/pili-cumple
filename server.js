require("dotenv").config();
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const archiver = require("archiver");
const rateLimit = require("express-rate-limit");
const QRCode = require("qrcode");

const { pool, init } = require("./db");
const r2 = require("./r2");

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "pilar2026";
const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(16).toString("hex");

const app = express();
// En Railway/hosting con proxy: necesario para que el rate-limit lea bien la IP real.
app.set("trust proxy", 1);
app.use(express.json());
app.use(cookieParser());

// ====== ANTI-SPAM (límite de envíos por IP) ======
// Subir fotos: más acotado porque pesa más.
const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutos
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Estás subiendo demasiado rápido. Probá de nuevo en un ratito 🌸" },
});
// Frases y confirmaciones.
const writeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutos
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados envíos seguidos. Esperá un momento y reintentá 🌸" },
});

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

// QR que apunta al muro (/muro) usando el dominio actual. Para imprimir y poner en las mesas.
app.get("/api/admin/qr", requireAdmin, async (req, res) => {
  try {
    const target = `${req.protocol}://${req.get("host")}/muro`;
    const png = await QRCode.toBuffer(target, {
      type: "png",
      width: 700,
      margin: 2,
      color: { dark: "#8a5a64", light: "#ffffffff" },
    });
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store");
    res.send(png);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "No se pudo generar el QR" });
  }
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

app.post("/api/photos", uploadLimiter, upload.single("image"), async (req, res) => {
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

// Descarga TODAS las fotos en un único ZIP (streaming desde R2).
app.get("/api/admin/photos/download", requireAdmin, async (req, res) => {
  try {
    if (!r2.isConfigured)
      return res.status(503).json({ error: "Almacenamiento de imágenes no configurado" });

    const { rows } = await pool.query(
      "SELECT name, caption, image_key, created_at FROM photos ORDER BY created_at ASC"
    );
    if (!rows.length) return res.status(404).json({ error: "No hay fotos para descargar" });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="fotos-pilar.zip"'
    );

    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.on("warning", (err) => console.warn("[zip] warning:", err.message));
    archive.on("error", (err) => {
      console.error("[zip] error:", err);
      res.destroy(err);
    });
    archive.pipe(res);

    const used = {};
    for (const p of rows) {
      if (!p.image_key) continue;
      const ext = (p.image_key.split(".").pop() || "jpg").toLowerCase();
      // Nombre legible y único: "Nombre.jpg", "Nombre-2.jpg", etc.
      const safe = (p.name || "foto").replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 40) || "foto";
      let base = safe;
      used[base] = (used[base] || 0) + 1;
      if (used[base] > 1) base = `${safe}-${used[base]}`;
      try {
        const stream = await r2.getObjectStream(p.image_key);
        archive.append(stream, { name: `${base}.${ext}` });
      } catch (e) {
        console.error("[zip] no se pudo agregar", p.image_key, e.message);
      }
    }
    await archive.finalize();
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.status(500).json({ error: "No se pudo generar el ZIP" });
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

app.post("/api/messages", writeLimiter, async (req, res) => {
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
app.post("/api/rsvps", writeLimiter, async (req, res) => {
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

/* ====== ARCHIVOS ESTÁTICOS Y PÁGINAS ====== */
// Solo se sirve la carpeta public/: index.html, muro.html, admin.html,
// fotos.html, frases.html y assets/. El código del servidor queda fuera.
// `extensions:["html"]` permite /muro, /admin, /fotos, /frases sin escribir el .html.
const PUBLIC_DIR = path.join(__dirname, "public");
app.use(
  express.static(PUBLIC_DIR, {
    extensions: ["html"],
    setHeaders(res, filePath) {
      if (filePath.endsWith(".html")) {
        // El HTML siempre fresco; los datos llegan por la API.
        res.setHeader("Cache-Control", "no-cache");
      } else {
        // Fotos, música, fuentes locales, favicon: cache largo.
        res.setHeader("Cache-Control", "public, max-age=604800, immutable");
      }
    },
  })
);

// 404 de la API en JSON; cualquier otra ruta cae a la invitación.
app.use("/api", (req, res) => res.status(404).json({ error: "No encontrado" }));
app.use((req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));

// Manejo de errores (multer: tamaño / tipo de archivo, etc.)
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
