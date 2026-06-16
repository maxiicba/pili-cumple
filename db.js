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
  `);
  console.log("[db] Tablas listas (photos, messages, rsvps).");
}

module.exports = { pool, init };
