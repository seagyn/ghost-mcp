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
 * Wrap an McpServer so that `.tool(name, ...)` silently refuses any name in
 * DENIED_TOOLS. Every other member passes through to the real server.
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
                    return (target as any).tool(name, ...rest);
                };
            }
            const value = (target as any)[prop];
            return typeof value === "function" ? value.bind(target) : value;
        },
    }) as McpServer;
}
