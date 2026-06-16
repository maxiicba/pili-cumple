const { Pool } = require("pg");

// Railway expone DATABASE_URL al agregar el plugin de PostgreSQL.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn(
    "[db] DATABASE_URL no está definida. Las funciones de base de datos no funcionarán hasta configurarla."
  );
}

// La conexión interna de Railway (postgres.railway.internal) no necesita SSL.
// Si conectás por la URL pública, definí DATABASE_SSL=true.
const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
});

async function init() {
  if (!connectionString) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS photos (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      caption TEXT,
      image_url TEXT NOT NULL,
      image_key TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS rsvps (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      attending TEXT NOT NULL,
      guests INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS gallery (
      id SERIAL PRIMARY KEY,
      caption TEXT,
      image_url TEXT NOT NULL,
      image_key TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS timeline (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT,
      image_url TEXT NOT NULL,
      image_key TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS trivia (
      id SERIAL PRIMARY KEY,
      question TEXT NOT NULL,
      options JSONB NOT NULL,
      correct INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS predictions (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      prediction TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await seedDefaults();
  console.log("[db] Tablas listas (photos, messages, rsvps, gallery, timeline, trivia, predictions).");
}

// Carga contenido inicial (la galería, la historia y unas preguntas de ejemplo)
// SOLO si las tablas están vacías. Así no se pisa nada que edites desde el admin.
async function seedDefaults() {
  const galleryDefaults = [
    ["assets/pili-sonriendo.jpeg", "¡Mi mejor sonrisa!"],
    ["assets/pili-risa.jpeg", "Pura alegría"],
    ["assets/pili-lentes.jpeg", "Estilo propio"],
    ["assets/pili-rio.jpeg", "Paseos con papá"],
    ["assets/pili-flor.jpeg", "Exploradora"],
    ["assets/pili-mono.jpeg", "Mi moñito"],
    ["assets/pili-gorrito.jpeg", "Abrigadita"],
    ["assets/pili-conejitos.jpeg", "Mi pose"],
    ["assets/pili-mamadera.jpeg", "Mi mamadera"],
    ["assets/pili-bandana.jpeg", "Carita curiosa"],
    ["assets/pili-cochecito.jpeg", "De paseo"],
  ];
  const timelineDefaults = [
    ["assets/pili-mamadera.jpeg", "Recién llegué", "El día que cambié sus vidas para siempre 💕"],
    ["assets/pili-gorrito.jpeg", "Mis primeros meses", "Dormir, comer y mil mimos 🍼"],
    ["assets/pili-sonriendo.jpeg", "Mi primera sonrisa", "Y se me iluminó la cara 😊"],
    ["assets/pili-conejitos.jpeg", "Aprendí a sentarme", "¡A mirar todo desde arriba! 🐰"],
    ["assets/pili-rio.jpeg", "A explorar el mundo", "Cada paseo, una aventura nueva 🌷"],
    ["assets/pili-mono.jpeg", "¡Mi primer añito!", "Y acá estoy, lista para festejar 🎂🎀"],
  ];
  const triviaDefaults = [
    ["¿En qué mes cumple Pili su primer añito?", ["Julio", "Agosto", "Septiembre", "Octubre"], 1],
    ["¿Cuál es el animalito de su fiesta?", ["Gatito", "Conejito", "Perrito", "Osito"], 1],
    ["¿De qué color es el tema del cumple?", ["Celeste", "Verde", "Rosa", "Amarillo"], 2],
  ];

  const g = await pool.query("SELECT COUNT(*)::int AS n FROM gallery");
  if (g.rows[0].n === 0) {
    for (let i = 0; i < galleryDefaults.length; i++) {
      await pool.query(
        "INSERT INTO gallery (image_url, caption, position) VALUES ($1,$2,$3)",
        [galleryDefaults[i][0], galleryDefaults[i][1], i]
      );
    }
    console.log("[db] Galería inicial cargada.");
  }

  const t = await pool.query("SELECT COUNT(*)::int AS n FROM timeline");
  if (t.rows[0].n === 0) {
    for (let i = 0; i < timelineDefaults.length; i++) {
      await pool.query(
        "INSERT INTO timeline (image_url, title, body, position) VALUES ($1,$2,$3,$4)",
        [timelineDefaults[i][0], timelineDefaults[i][1], timelineDefaults[i][2], i]
      );
    }
    console.log("[db] Historia inicial cargada.");
  }

  const q = await pool.query("SELECT COUNT(*)::int AS n FROM trivia");
  if (q.rows[0].n === 0) {
    for (let i = 0; i < triviaDefaults.length; i++) {
      await pool.query(
        "INSERT INTO trivia (question, options, correct, position) VALUES ($1,$2::jsonb,$3,$4)",
        [triviaDefaults[i][0], JSON.stringify(triviaDefaults[i][1]), triviaDefaults[i][2], i]
      );
    }
    console.log("[db] Trivia inicial cargada.");
  }
}

module.exports = { pool, init };
