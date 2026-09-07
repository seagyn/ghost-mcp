// src/tools/pages.ts
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghostApiClient } from "../ghostApi";

// Pages are a separate Ghost Admin API resource from posts, with the same
// verbs and an near-identical object shape:
// https://ghost.org/docs/admin-api/pages/overview
//
// This module deliberately mirrors src/tools/posts.ts so the two stay easy to
// diff. The one field intentionally NOT carried over is `email_only`: pages are
// never delivered as a newsletter, so it has no meaning here.

// Parameter schemas as ZodRawShape (object literals)
const browseParams = {
  filter: z.string().optional(),
  limit: z.number().optional(),
  page: z.number().optional(),
  order: z.string().optional(),
};
const readParams = {
  id: z.string().optional(),
  slug: z.string().optional(),
};
const tagRef = z.union([
  z.string(),
  z.object({
    id: z.string().optional(),
    slug: z.string().optional(),
    name: z.string().optional(),
  }),
]);
const authorRef = z.union([
  z.string(),
  z.object({
    id: z.string().optional(),
    slug: z.string().optional(),
    email: z.string().optional(),
  }),
]);
const pageMutableFields = {
  html: z.string().optional(),
  lexical: z.string().optional(),
  status: z.string().optional(),
  slug: z.string().optional(),
  visibility: z.string().optional(),
  featured: z.boolean().optional(),
  published_at: z.string().optional(),
  custom_excerpt: z.string().optional(),
  feature_image: z.string().optional(),
  feature_image_alt: z.string().optional(),
  feature_image_caption: z.string().optional(),
  meta_title: z.string().optional(),
  meta_description: z.string().optional(),
  og_title: z.string().optional(),
  og_description: z.string().optional(),
  og_image: z.string().optional(),
  twitter_title: z.string().optional(),
  twitter_description: z.string().optional(),
  twitter_image: z.string().optional(),
  codeinjection_head: z.string().optional(),
  codeinjection_foot: z.string().optional(),
  canonical_url: z.string().optional(),
  tags: z.array(tagRef).optional(),
  authors: z.array(authorRef).optional(),
};
const addParams = {
  title: z.string(),
  ...pageMutableFields,
};
const editParams = {
  id: z.string(),
  // Ghost rejects an edit whose updated_at does not match the stored value, so
  // the caller must read the page first. Required here rather than optional so
  // the collision check cannot be skipped by omission.
  updated_at: z.string(),
  title: z.string().optional(),
  ...pageMutableFields,
};
const deleteParams = {
  id: z.string(),
};

// --- Draft-scoped tools -----------------------------------------------------
// See the equivalent block in src/tools/posts.ts. `status` is removed from the
// field set rather than validated, so publishing is not expressible here, and
// pages_draft_edit resolves updated_at itself after confirming the target is
// still a draft.
const { status: _statusIsForcedToDraft, ...draftMutableFields } = pageMutableFields;

const draftAddParams = {
  title: z.string(),
  ...draftMutableFields,
};
const draftEditParams = {
  id: z.string(),
  title: z.string().optional(),
  ...draftMutableFields,
};

export function registerPageTools(server: McpServer) {
  // Add a DRAFT page — status forced, cannot publish.
  server.tool(
    "pages_draft_add",
    draftAddParams,
    async (args, _extra) => {
      const options = args.html ? { source: "html" } : undefined;
      const page = await ghostApiClient.pages.add(
        { ...args, status: "draft" },
        options
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(page, null, 2),
          },
        ],
      };
    }
  );

  // Edit a DRAFT page — refuses anything already published.
  server.tool(
    "pages_draft_edit",
    draftEditParams,
    async (args, _extra) => {
      const current = await ghostApiClient.pages.read({ id: args.id });
      if (current?.status !== "draft") {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text:
                `Refusing to edit page ${args.id}: its status is ` +
                `"${current?.status}", not "draft". pages_draft_edit only ` +
                `touches drafts. Use pages_edit for a published page.`,
            },
          ],
        };
      }
      const { id, ...changes } = args;
      const options = args.html ? { source: "html" } : undefined;
      const page = await ghostApiClient.pages.edit(
        { id, updated_at: current.updated_at, ...changes, status: "draft" },
        options
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(page, null, 2),
          },
        ],
      };
    }
  );


  // Browse pages
  server.tool(
    "pages_browse",
    browseParams,
    async (args, _extra) => {
      const pages = await ghostApiClient.pages.browse(args);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(pages, null, 2),
          },
        ],
      };
    }
  );

  // Read page
  server.tool(
    "pages_read",
    readParams,
    async (args, _extra) => {
      const page = await ghostApiClient.pages.read(args);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(page, null, 2),
          },
        ],
      };
    }
  );

  // Add page
  server.tool(
    "pages_add",
    addParams,
    async (args, _extra) => {
      // If html is present, ask Ghost to convert it server-side rather than
      // treating it as an opaque blob.
      const options = args.html ? { source: "html" } : undefined;
      const page = await ghostApiClient.pages.add(args, options);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(page, null, 2),
          },
        ],
      };
    }
  );

  // Edit page
  server.tool(
    "pages_edit",
    editParams,
    async (args, _extra) => {
      const options = args.html ? { source: "html" } : undefined;
      const page = await ghostApiClient.pages.edit(args, options);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(page, null, 2),
          },
        ],
      };
    }
  );

  // Delete page — denied by src/policy.ts, kept for parity with posts so an
  // upstream merge does not reintroduce it as an unguarded registration.
  server.tool(
    "pages_delete",
    deleteParams,
    async (args, _extra) => {
      await ghostApiClient.pages.delete(args);
      return {
        content: [
          {
            type: "text",
            text: `Page with id ${args.id} deleted.`,
          },
        ],
      };
    }
  );
}
