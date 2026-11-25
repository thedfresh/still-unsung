import type { NextRequest } from "next/server";
import { handlers } from "@/auth";
import { AppError, errorResponse } from "@/lib/errors";
import { clientKey, signInLimiter } from "@/lib/rate-limit";

type Handler = (request: NextRequest) => Promise<Response>;

/** Rate-limit every sign-in request for each client, before Auth.js sees it. */
function limited(handler: Handler): Handler {
  return async (request) => {
    if (!signInLimiter().hit(clientKey(request.headers))) return errorResponse(new AppError("rate_limited"));
    return handler(request);
  };
}

export const GET = limited(handlers.GET);
export const POST = limited(handlers.POST);
