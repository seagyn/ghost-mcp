// src/tools/posts.ts
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghostApiClient } from "../ghostApi";

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
// Shared mutable post fields — accepted by both posts_add and posts_edit.
// Mirrors the Ghost Admin API post resource:
// https://ghost.org/docs/admin-api/#the-post-object
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
const postMutableFields = {
  html: z.string().optional(),
  lexical: z.string().optional(),
  status: z.string().optional(),
  slug: z.string().optional(),
  visibility: z.string().optional(),
  featured: z.boolean().optional(),
  email_only: z.boolean().optional(),
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
  ...postMutableFields,
};
const editParams = {
  id: z.string(),
  updated_at: z.string(),
  title: z.string().optional(),
  ...postMutableFields,
};
const deleteParams = {
  id: z.string(),
};

// --- Draft-scoped tools -----------------------------------------------------
//
// posts_add and posts_edit are the full-power tools: they can publish (status
// is settable) and they can overwrite a published post. That makes them
// reasonable to gate behind human approval, but painful in a drafting loop.
//
// These two are safe by construction instead, so they can be auto-approved:
//   - status is not a parameter at all, and is forced to "draft"
//   - the edit refuses outright if the target is not currently a draft
//   - the edit fetches updated_at itself, so a stale value cannot 409 and the
//     caller does not have to read the post first
//
// `status` is removed from the field set rather than validated, so "publish
// from a draft tool" is not expressible in the schema the model sees.
const { status: _statusIsForcedToDraft, ...draftMutableFields } = postMutableFields;

const draftAddParams = {
  title: z.string(),
  ...draftMutableFields,
};
const draftEditParams = {
  id: z.string(),
  title: z.string().optional(),
  ...draftMutableFields,
};

export function registerPostTools(server: McpServer) {
  // Add a DRAFT post — status forced, cannot publish.
  server.tool(
    "posts_draft_add",
    draftAddParams,
    async (args, _extra) => {
      const options = args.html ? { source: "html" } : undefined;
      const post = await ghostApiClient.posts.add(
        { ...args, status: "draft" },
        options
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(post, null, 2),
          },
        ],
      };
    }
  );

  // Edit a DRAFT post — refuses anything already published, and resolves
  // updated_at itself so the caller never supplies a stale one.
  server.tool(
    "posts_draft_edit",
    draftEditParams,
    async (args, _extra) => {
      const current = await ghostApiClient.posts.read({ id: args.id });
      if (current?.status !== "draft") {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text:
                `Refusing to edit post ${args.id}: its status is ` +
                `"${current?.status}", not "draft". posts_draft_edit only ` +
                `touches drafts. Use posts_edit for a published post.`,
            },
          ],
        };
      }
      const { id, ...changes } = args;
      const options = args.html ? { source: "html" } : undefined;
      const post = await ghostApiClient.posts.edit(
        { id, updated_at: current.updated_at, ...changes, status: "draft" },
        options
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(post, null, 2),
          },
        ],
      };
    }
  );


  // Browse posts
  server.tool(
    "posts_browse",
    browseParams,
    async (args, _extra) => {
      const posts = await ghostApiClient.posts.browse(args);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(posts, null, 2),
          },
        ],
      };
    }
  );

  // Read post
  server.tool(
    "posts_read",
    readParams,
    async (args, _extra) => {
      const post = await ghostApiClient.posts.read(args);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(post, null, 2),
          },
        ],
      };
    }
  );

  // Add post
  server.tool(
    "posts_add",
    addParams,
    async (args, _extra) => {
      // If html is present, use source: "html" to ensure Ghost uses the html content
      const options = args.html ? { source: "html" } : undefined;
      const post = await ghostApiClient.posts.add(args, options);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(post, null, 2),
          },
        ],
      };
    }
  );

  // Edit post
  server.tool(
    "posts_edit",
    editParams,
    async (args, _extra) => {
      // If html is present, use source: "html" to ensure Ghost uses the html content for updates
      const options = args.html ? { source: "html" } : undefined;
      const post = await ghostApiClient.posts.edit(args, options);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(post, null, 2),
          },
        ],
      };
    }
  );

  // Delete post
  server.tool(
    "posts_delete",
    deleteParams,
    async (args, _extra) => {
      await ghostApiClient.posts.delete(args);
      return {
        content: [
          {
            type: "text",
            text: `Post with id ${args.id} deleted.`,
          },
        ],
      };
    }
  );
}