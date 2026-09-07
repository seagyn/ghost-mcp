// src/tools/roles.ts
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
  name: z.string().optional(),
  // Comma-separated list of fields to return, e.g. "id,title,slug".
  // Slims the response; omit for Ghost's default field set.
  fields: z.string().optional(),
};

export function registerRoleTools(server: McpServer) {
  // Browse roles
  server.tool(
    "roles_browse",
    browseParams,
    async (args, _extra) => {
      const roles = await ghostApiClient.roles.browse(args);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(roles, null, 2),
          },
        ],
      };
    }
  );

  // Read role
  server.tool(
    "roles_read",
    readParams,
    async (args, _extra) => {
      const role = await ghostApiClient.roles.read(args);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(role, null, 2),
          },
        ],
      };
    }
  );
}