// One-shot: apply db/schema.sql to DATABASE_URL. Safe to re-run.
import fs from "fs";
import { neon } from "@neondatabase/serverless";
const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL missing"); process.exit(1); }
const sql = neon(url);
const text = fs.readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
const stmts = text.split(/;\s*\n/).map((s) => s.replace(/--[^\n]*/g, "").trim()).filter(Boolean);
for (const s of stmts) { await sql(s); }
const t = await sql("select table_name from information_schema.tables where table_schema='public' order by 1");
console.log("Schema ready. Tables:", t.map((r) => r.table_name).join(", "));
