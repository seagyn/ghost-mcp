// src/policy.ts
//
// LOCAL HARDENING — not present upstream.
//
// A Ghost Admin API key cannot be scoped: it is all-or-nothing, with no
// read-only mode and no per-resource restriction. The only place the
// capability surface can be reduced is therefore at registration time, here.
//
// Denied tools are never registered, so they do not appear in tools/list and
// cannot be called even if a model is prompt-injected into trying. This is
// enforced at the registration boundary rather than by editing each tool
// file, so upstream changes still merge cleanly.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const DENIED_TOOLS: ReadonlySet<string> = new Set([
    // Arbitrary target_url with no validation. A webhook survives this MCP
    // being uninstalled, making it a persistent exfiltration channel for
    // member.added / post.published events.
    "webhooks_add",
    "webhooks_edit",
    "webhooks_delete",

    // Privilege-granting. invites_add takes an arbitrary role_id; Ghost should
    // 403 these for an integration key, but do not rely on that holding.
    "invites_add",
    "invites_browse",
    "invites_delete",
    "users_edit",
    "users_delete",

    // Irreversible, and offered with no confirmation step.
    "members_delete",
    "newsletters_delete",
    "offers_delete",
    "pages_delete",
    "posts_delete",
    "tags_delete",
    "tiers_delete",
]);

/**
 * Human-readable description per tool.
 *
 * WHY THIS EXISTS: upstream registers every tool with the three-argument
 * `server.tool(name, paramsSchema, handler)` form, which leaves the
 * description undefined. That is legal MCP, and the server happily reports all
 * of them over `tools/list` — but a client that validates tool specs can drop
 * a tool with an empty description, and at least one does: Kiro Crew excluded
 * all 36 silently, so `/mcp` showed the server healthy with 36 tools while
 * `/tools` listed none of them and nothing was callable.
 *
 * Descriptions are injected here rather than added to ten tool files, so the
 * fix lives at the same boundary as the deny-list and upstream still merges.
 * They are also what the model reads to pick a tool, so they say what each one
 * is FOR, not just what it wraps.
 */
const TOOL_DESCRIPTIONS: Record<string, string> = {
    // Posts — draft-scoped (safe, cannot publish)
    posts_draft_add:
        "Create a new Ghost post as a DRAFT. Cannot publish: status is forced to draft. " +
        "Pass title plus html (converted by Ghost) or lexical. Use this for all normal drafting.",
    posts_draft_edit:
        "Revise an existing DRAFT post. Refuses if the post is already published, and resolves " +
        "updated_at itself so you do not need to read the post first. Use this to iterate on a draft.",

    // Posts — full power
    posts_browse:
        "List posts, newest first. Supports filter (e.g. 'status:draft', 'tag:slug'), limit, page, " +
        "order, fields (slim the response) and formats. Use to find a post's id or survey the site.",
    posts_read:
        "Read one post by id or slug. Pass formats='html,plaintext' to get the body back as plain " +
        "text, which is the easiest form to review or revise.",
    posts_add:
        "Create a post with full control, INCLUDING publishing (status is settable). Prefer " +
        "posts_draft_add unless publishing was explicitly requested.",
    posts_edit:
        "Edit any post, including a published one, and can publish. Requires the post's current " +
        "updated_at. Prefer posts_draft_edit unless changing something already live.",

    // Pages — a separate Ghost resource from posts (About, Contact, and similar)
    pages_draft_add:
        "Create a new Ghost page as a DRAFT. Pages are standalone (About, Contact) and are not " +
        "part of the post feed. Cannot publish: status is forced to draft.",
    pages_draft_edit:
        "Revise an existing DRAFT page. Refuses anything already published and resolves updated_at itself.",
    pages_browse:
        "List pages. Same parameters as posts_browse (filter, limit, page, order, fields, formats).",
    pages_read: "Read one page by id or slug. Pass formats='html,plaintext' for the body as plain text.",
    pages_add: "Create a page with full control, including publishing. Prefer pages_draft_add.",
    pages_edit:
        "Edit any page, including a published one. Requires updated_at. Prefer pages_draft_edit.",

    // Tags
    tags_browse: "List content tags, with filter, limit, page, order and fields.",
    tags_read: "Read one tag by id or slug.",
    tags_add: "Create a tag. Takes name, and optionally description and slug.",
    tags_edit: "Update a tag's name, description or slug by id.",

    // Members — returns unmasked subscriber PII, treat with care
    members_browse:
        "List members (subscribers). Returns UNMASKED personal data including email addresses and " +
        "Stripe identifiers, so pull the narrowest page you need and never quote emails back.",
    members_read:
        "Read one member by id or email. Returns unmasked personal and subscription data.",
    members_add: "Create a member. Takes email, and optionally name, note, labels and newsletters.",
    members_edit: "Update a member's email, name, note, labels or newsletters by id.",

    // Newsletters
    newsletters_browse: "List newsletters configured on the site.",
    newsletters_read: "Read one newsletter by id or slug.",
    newsletters_add: "Create a newsletter. Takes name plus optional sender and appearance settings.",
    newsletters_edit: "Update a newsletter's name, sender details or appearance settings by id.",

    // Offers
    offers_browse: "List promotional offers.",
    offers_read: "Read one offer by id or code.",
    offers_add:
        "Create an offer. Requires name, code, cadence, duration, amount, tier_id and type.",
    offers_edit: "Update an offer's name, code or display text by id.",

    // Tiers
    tiers_browse: "List subscription tiers. Supports include for prices and benefits.",
    tiers_read: "Read one tier by id or slug.",
    tiers_add: "Create a tier. Takes name plus optional pricing, visibility and benefits.",
    tiers_edit: "Update a tier's name, pricing, visibility or benefits by id.",

    // Users and roles — read-only for an integration key
    users_browse: "List staff users on the site. Read-only with an integration key.",
    users_read: "Read one staff user by id, email or slug.",
    roles_browse: "List the staff roles defined on the site.",
    roles_read: "Read one role by id or name.",
};

/**
 * Wrap an McpServer so that `.tool(name, ...)` silently refuses any name in
 * DENIED_TOOLS, and supplies a description for any name that lacks one.
 * Every other member passes through to the real server.
 */
export function hardened(server: McpServer): McpServer {
    return new Proxy(server, {
        get(target, prop) {
            if (prop === "tool") {
                return (name: string, ...rest: unknown[]) => {
                    if (DENIED_TOOLS.has(name)) {
                        console.error(`[hardened] tool not registered (deny-list): ${name}`);
                        return undefined;
                    }
                    // Upstream calls tool(name, paramsSchema, handler) with no
                    // description. Insert one so validating clients keep the tool.
                    if (typeof rest[0] !== "string") {
                        const description = TOOL_DESCRIPTIONS[name];
                        if (description) {
                            return (target as any).tool(name, description, ...rest);
                        }
                        console.error(`[hardened] no description for ${name} — client may drop it`);
                    }
                    return (target as any).tool(name, ...rest);
                };
            }
            const value = (target as any)[prop];
            return typeof value === "function" ? value.bind(target) : value;
        },
    }) as McpServer;
}
