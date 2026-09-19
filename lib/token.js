// Auth token helpers. Web Crypto only, so it runs in both Node and Edge.
const SALT = "pulse_ryderschilling_v1";

async function sha(s) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
export async function expectedToken() {
  const pw = process.env.DASHBOARD_PASSWORD || "";
  if (!pw) return null; // open mode
  return sha(pw + SALT);
}
export async function hashPassword(pw) {
  return sha(String(pw ?? "") + SALT);
}
export const COOKIE_NAME = "pulse_auth";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 180;
