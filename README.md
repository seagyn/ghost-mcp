# ghost-mcp (hardened fork)

A Model Context Protocol server for Ghost CMS. This is a fork of
[MFYDev/ghost-mcp](https://github.com/MFYDev/ghost-mcp) that removes the tools
which are dangerous to hand to a language model, adds coverage for pages, and
adds draft-scoped write tools that cannot publish.

## Why this fork exists

A Ghost Admin API key cannot be scoped. There is no read-only mode, no
per-resource restriction, and no short-lived token. An integration key is
all-or-nothing, so the only place the capability surface can be reduced is at
tool registration, before the model ever sees a tool exists.

Upstream registers every verb the Ghost client offers. That includes creating
webhooks pointing at arbitrary URLs, which is a persistent exfiltration channel
that outlives the server being uninstalled, and unconfirmed deletes on every
resource. This fork refuses those.

## What is refused

`src/policy.ts` holds a deny-list enforced by a Proxy over `McpServer.tool()`.
Denied names are never registered, so they do not appear in `tools/list` and
cannot be called even if the model is talked into trying.

| Refused | Reason |
| --- | --- |
| `webhooks_add`, `webhooks_edit`, `webhooks_delete` | `target_url` is an arbitrary URL with no validation. A webhook keeps firing after this server is gone. |
| `invites_add`, `invites_browse`, `invites_delete`, `users_edit`, `users_delete` | Privilege-granting. `invites_add` accepts an arbitrary `role_id`. |
| `posts_delete`, `pages_delete`, `tags_delete`, `tiers_delete`, `members_delete`, `newsletters_delete`, `offers_delete` | Irreversible, and offered with no confirmation step. |

Most of those are not reachable with an integration key anyway, so refusing
them costs almost no real capability. The four that were genuinely callable are
`posts_delete`, `tags_delete` and the three webhook tools.

There is deliberately no theme upload tool. `POST /admin/themes/upload` is open
to integration keys and a theme is a ZIP that can carry front-end JavaScript for
the public site. If an upstream merge ever adds one, it belongs in the
deny-list, not in the tool list.

## What is added

**Pages.** Upstream has no `pages_*` tools at all, so standalone pages such as
About or Contact were unreachable while posts were fully covered. `pages_browse`,
`pages_read`, `pages_add` and `pages_edit` mirror the posts module.

**Draft-scoped write tools.** `posts_add` and `posts_edit` are full-power:
`status` is settable so they can publish, and edit can overwrite a published
post. Those are worth gating behind human approval, which makes a drafting loop
tedious. So there are narrower tools that are safe by construction:

- `posts_draft_add`, `pages_draft_add` force `status: "draft"`. It is not a
  parameter, so publishing is not expressible in the schema the model sees.
- `posts_draft_edit`, `pages_draft_edit` read the target first and refuse if it
  is not a draft, so published content cannot be overwritten. They also resolve
  `updated_at` themselves, so a stale value cannot trigger Ghost's collision
  error and the caller does not need a separate read.

That split is the point: approve the narrow tools freely, keep the powerful ones
behind a prompt.

## Tools

Read: `posts_browse`, `posts_read`, `pages_browse`, `pages_read`, `tags_browse`,
`tags_read`, `tiers_browse`, `tiers_read`, `newsletters_browse`,
`newsletters_read`, `offers_browse`, `offers_read`, `members_browse`,
`members_read`, `users_browse`, `users_read`, `roles_browse`, `roles_read`.

Write: `posts_draft_add`, `posts_draft_edit`, `pages_draft_add`,
`pages_draft_edit`, `posts_add`, `posts_edit`, `pages_add`, `pages_edit`,
`tags_add`, `tags_edit`, `tiers_add`, `tiers_edit`, `newsletters_add`,
`newsletters_edit`, `offers_add`, `offers_edit`, `members_add`, `members_edit`.

`members_browse` and `members_read` return unmasked subscriber data, including
email addresses and Stripe customer identifiers. Treat them as a separate
approval tier from the rest of the read tools.

## Running it

Build, then run `build/server.js` over stdio with three environment variables:

```
GHOST_API_URL=https://yoursite.ghost.io
GHOST_ADMIN_API_KEY=<id>:<secret>
GHOST_API_VERSION=v5.0
```

`GHOST_API_VERSION` must be a `v5.x` value even on a Ghost 6 site. The Ghost
client maps `v5` and `v5.x` to the unversioned `/admin/` path, but any other
`v{major}.{minor}` to `/v{major}/admin/`, a versioned path Ghost removed in v5.
Setting `v6.0` makes every request return 404. The real version is negotiated
through the `Accept-Version` header.

Do not put the key in your MCP client's config file. Config files get committed,
and a key passed inside a shell command string is visible to `ps` for every
process on the machine. Fetch it in a launcher script instead, so it reaches the
server through the environment and never through a command line.

## Tests

```
npm test
```

`scripts/check-denied-tools.mjs` starts the real server, asks it over MCP what it
exposes, and fails if anything matching `_delete$`, `^webhooks_`, `^invites_`,
`^themes_` or `^settings_` is reachable. It also asserts an expected-safe set is
present, so a server that registered nothing cannot pass vacuously. It needs no
credential and makes no network calls.

This exists because the deny-list is only correct as long as it names the right
tools. Run it after every merge from upstream.

## Attribution

Forked from [MFYDev/ghost-mcp](https://github.com/MFYDev/ghost-mcp) by Fanyang
Meng. MIT licensed, same as upstream.
