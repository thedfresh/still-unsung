import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatPreview } from "@/lib/changes/preview-format";
import { readableTypes, writableTypes } from "@/lib/content-access";
import { applyChanges } from "@/lib/data/changes/apply";
import { previewChanges } from "@/lib/data/changes/preview";
import { getRecord, searchRecords } from "@/lib/data/records";
import { toErrorBody } from "@/lib/errors";
import { formatApplyResult } from "@/lib/mcp/format";
import { MAX_EDITS } from "@/lib/validation/content";
import type { CurrentUser } from "@/lib/roles";

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

const text = (value: string): ToolResult => ({ content: [{ type: "text", text: value }] });

/** Run a tool and turn any error into the one error shape, as text. Details never leak. */
async function run(work: () => Promise<string>): Promise<ToolResult> {
  try {
    return text(await work());
  } catch (err) {
    const { body } = toErrorBody(err);
    return { content: [{ type: "text", text: JSON.stringify(body, null, 1) }], isError: true };
  }
}

const EDIT_HELP = `Each edit is { op: "create", type, ref?, fields } or { op: "update", type, id, rev, fields }.
Give "rev" as you read it. A field that points at a new record in the same call takes { "ref": "<that record's ref>" }.
A new Segment takes "before": <segment id or { "ref" }> or "after": the same, next to the segment it goes beside. The server makes the sort key and takes the set from that segment. Send "sortKey" and "setId" only for the first segment of an empty set.
Writable types: ${writableTypes().join(", ")}. Lists (such as SetType) are not writable: ask the user to add a value.`;

/**
 * The app's MCP server. It serves one signed-in agent user (the caller checks the token and the
 * role first). Each tool acts for that user: the only write path for agents (data-model item 16).
 */
export function createContentMcpServer(user: CurrentUser): McpServer {
  const server = new McpServer({ name: "still-unsung", version: "0.1.0" });

  server.registerTool(
    "preview_changes",
    {
      description: `Check a list of edits and show what they would do. Nothing is saved. Up to ${MAX_EDITS} edits per call. Show the preview to the user; apply it only after the user approves. ${EDIT_HELP}`,
      inputSchema: {
        evidence: z
          .record(z.string(), z.unknown())
          .describe('Name the evidence once: { sourceId } or { recordingId } or { contributorId }, with an optional "place" (page, time on the tape); or { ownKnowledge: true }.'),
        edits: z.array(z.record(z.string(), z.unknown())).max(MAX_EDITS * 2).describe("The edits, in order."),
        isPublic: z.boolean().optional().describe("Whether the change is listed in the public list of recent changes. Leave out to use the default for the type of change."),
      },
    },
    ({ evidence, edits, isPublic }) =>
      run(async () => {
        const preview = await previewChanges(user.id, { evidence, edits, isPublic });
        return formatPreview(preview);
      }),
  );

  server.registerTool(
    "apply_changes",
    {
      description: "Apply one preview by its token, after the user approved it. The token works once and expires after 30 minutes.",
      inputSchema: {
        token: z.string().min(1).max(200),
        isPublic: z.boolean().optional().describe("Change whether the change is listed in recent changes, as the user chose."),
      },
    },
    ({ token, isPublic }) => run(async () => formatApplyResult(await applyChanges(user.id, token, isPublic))),
  );

  server.registerTool(
    "get_record",
    {
      description: `Read one record by ID or legacy ID, with its citations, notes, tags and external IDs. A show also comes with its sets in order and the segments of each set in order, with their sortKey. Private fields are included. Types: ${readableTypes().join(", ")}.`,
      inputSchema: { type: z.string(), id: z.number().int().positive().optional(), legacyId: z.string().max(200).optional() },
    },
    ({ type, id, legacyId }) => run(async () => JSON.stringify(await getRecord(type, { id, legacyId }), null, 1)),
  );

  server.registerTool(
    "search_records",
    {
      description: "Find records of one type by name or title (query), and for shows by date (1978, 1978-05 or 1978-05-23) and place name. Returns IDs and names; use get_record for detail.",
      inputSchema: {
        type: z.string(),
        query: z.string().max(200).optional(),
        date: z.string().max(10).optional(),
        place: z.string().max(200).optional(),
        limit: z.number().int().min(1).max(25).optional(),
      },
    },
    (input) => run(async () => JSON.stringify(await searchRecords(input), null, 1)),
  );

  return server;
}
