import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { defineRoute } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { createContentMcpServer } from "@/lib/mcp/server";

/**
 * The MCP server for agents (HSA-26). It accepts only an agent access token: a browser session
 * never reaches it, and a token never acts as ADMIN. Each request is stateless: a new server
 * for the signed-in agent user, one JSON answer, nothing kept between calls.
 */
export const POST = defineRoute({
  roles: ["AGENT"],
  handler: async (user, request) => {
    if (user.via !== "token") throw new AppError("forbidden", "This endpoint accepts only an agent access token.");
    const server = createContentMcpServer(user);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    response.headers.set("Cache-Control", "no-store");
    return response;
  },
});

/** The server keeps no session, so there is no stream to open and nothing to close. */
export const GET = () => Response.json({ error: { code: "forbidden", message: "Use POST." } }, { status: 405, headers: { Allow: "POST" } });
export const DELETE = GET;
