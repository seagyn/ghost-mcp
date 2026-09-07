// src/tools/members.ts
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghostApiClient } from "../ghostApi";

// Parameter schemas as ZodRawShape (object literals)
const browseParams = {
  filter: z.string().optional(),
  limit: z.number().optional(),
  page: z.number().optional(),
  order: z.string().optional(),
  // Comma-separated list of fields to return, e.g. "id,title,slug".
  // Slims the response; omit for Ghost's default field set.
  fields: z.string().optional(),
};
const readParams = {
  id: z.string().optional(),
  email: z.string().optional(),
  // Comma-separated list of fields to return, e.g. "id,title,slug".
  // Slims the response; omit for Ghost's default field set.
  fields: z.string().optional(),
};
const addParams = {
  email: z.string(),
  name: z.string().optional(),
  note: z.string().optional(),
  labels: z.array(z.object({ name: z.string(), slug: z.string().optional() })).optional(),
  newsletters: z.array(z.object({ id: z.string() })).optional(),
};
const editParams = {
  id: z.string(),
  email: z.string().optional(),
  name: z.string().optional(),
  note: z.string().optional(),
  labels: z.array(z.object({ name: z.string(), slug: z.string().optional() })).optional(),
  newsletters: z.array(z.object({ id: z.string() })).optional(),
};
const deleteParams = {
  id: z.string(),
};

export function registerMemberTools(server: McpServer) {
  // Browse members
  server.tool(
    "members_browse",
    browseParams,
    async (args, _extra) => {
      const members = await ghostApiClient.members.browse(args);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(members, null, 2),
          },
        ],
      };
    }
  );

  // Read member
  server.tool(
    "members_read",
    readParams,
    async (args, _extra) => {
      const member = await ghostApiClient.members.read(args);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(member, null, 2),
          },
        ],
      };
    }
  );

  // Add member
  server.tool(
    "members_add",
    addParams,
    async (args, _extra) => {
      const member = await ghostApiClient.members.add(args);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(member, null, 2),
          },
        ],
      };
    }
  );

  // Edit member
  server.tool(
    "members_edit",
    editParams,
    async (args, _extra) => {
      const member = await ghostApiClient.members.edit(args);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(member, null, 2),
          },
        ],
      };
    }
  );

  // Delete member
  server.tool(
    "members_delete",
    deleteParams,
    async (args, _extra) => {
      await ghostApiClient.members.delete(args);
      return {
        content: [
          {
            type: "text",
            text: `Member with id ${args.id} deleted.`,
          },
        ],
      };
    }
  );
}