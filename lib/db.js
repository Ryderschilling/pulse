// One tiny query() over either the Neon HTTP driver (production, Vercel) or a
// plain pg Pool (local Postgres for tests). Everything else in the app calls
// q(text, params) and gets rows back.
import fs from "fs";
import path from "path";

let _neon = null;
let _pg = null;

function driver() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (process.env.PULSE_DB_DRIVER === "pg") {
    if (!_pg) {
      // eslint-disable-next-line global-require
      const { Pool } = require("pg");
      _pg = new Pool({ connectionString: url, max: 4 });
    }
    return async (text, params) => (await _pg.query(text, params)).rows;
  }
  if (!_neon) {
    // eslint-disable-next-line global-require
    const { neon } = require("@neondatabase/serverless");
    _neon = neon(url);
  }
  // Conventional call: neon(text, params) -> rows
  return async (text, params) => _neon(text, params || []);
}

export async function q(text, params = []) {
  return driver()(text, params);
}

let schemaReady = false;
export async function ensureSchema() {
  if (schemaReady) return;
  const file = path.join(process.cwd(), "db", "schema.sql");
  const sql = fs.readFileSync(file, "utf8");
  // Split on blank-line-separated statements; each is idempotent.
  const stmts = sql
    .split(/;\s*\n/)
    .map((s) => s.replace(/--[^\n]*/g, "").trim())
    .filter(Boolean);
  for (const s of stmts) await q(s);
  schemaReady = true;
}

export function newId(len = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  const bytes = require("crypto").randomBytes(len);
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}
