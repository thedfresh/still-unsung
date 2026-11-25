/**
 * The agent import rules live in one private guide page (HSA-168, data-model item 115). The
 * rules are policy, so the text is in the database and never in this repository.
 */
export const IMPORT_RULES_SLUG = "agent-import-rules";
export const IMPORT_RULES_TITLE = "Agent import rules";
export const IMPORT_RULES_PLACEHOLDER = "Placeholder. The curator loads the real import rules through the MCP tools.";

/** Sent to every MCP client at connect time. It is fixed text: the rules are read on request. */
export const MCP_INSTRUCTIONS =
  "Before any import or grooming, call `get_import_rules` and follow them. Then use `preview_changes` and `apply_changes` to write.";
