import { gmailRoute } from "@/lib/api";
import { searchThreads, threadBodies } from "@/lib/gmail";
import { CARD_INPUT, BM_PAY_INPUT, cardThreadsNeedingBodies } from "@/lib/rules";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Credit card statements and the payments that settle them
export const GET = gmailRoute(async (token) => {
  const [cardPayload, bmPayload] = await Promise.all([
    searchThreads(token, CARD_INPUT.query, CARD_INPUT.pageSize),
    searchThreads(token, BM_PAY_INPUT.query, BM_PAY_INPUT.pageSize),
  ]);
  const details = await threadBodies(token, cardThreadsNeedingBodies(cardPayload, bmPayload));
  return { cardPayload, bmPayload, details, at: Date.now() };
});
