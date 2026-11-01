import { gmailRoute } from "@/lib/api";
import { searchThreads } from "@/lib/gmail";
import { FEED_INPUT } from "@/lib/rules";

export const dynamic = "force-dynamic";

// Unread, important mail from the last 3 days
export const GET = gmailRoute(async (token) => ({
  payload: await searchThreads(token, FEED_INPUT.query, FEED_INPUT.pageSize),
  at: Date.now(),
}));
