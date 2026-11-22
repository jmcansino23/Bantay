import { Redis } from "@upstash/redis";

// Upstash Redis added from the Vercel Marketplace (either env-var naming), or null if not set up.
export function redis() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}

export const keys = {
  charges: (email) => `bantay:charges:${email}`, // hash: chargeId -> charge
  chargesMeta: (email) => `bantay:charges-meta:${email}`, // hash: firstImportAt
  status: (email) => `bantay:recurring:${email}`, // hash: service -> {state, at}
};

// Upstash may hand back stored JSON as an object or as a string, depending on how it was written.
export const parse = (v) => {
  if (v && typeof v === "object") return v;
  try { return JSON.parse(v); } catch { return null; }
};
