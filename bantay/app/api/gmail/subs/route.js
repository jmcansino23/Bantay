import { gmailRoute } from "@/lib/api";
import { searchThreads, threadBodies } from "@/lib/gmail";
import { SUB_INPUT, billThreadsNeedingBodies } from "@/lib/rules";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Claude Pro receipts, Omantel and Pag-IBIG bills (with the text needed to read month, balance and due date)
export const GET = gmailRoute(async (token) => {
  const payload = await searchThreads(token, SUB_INPUT.query, SUB_INPUT.pageSize);
  const details = await threadBodies(token, billThreadsNeedingBodies(payload));
  return { payload, details, at: Date.now() };
});
