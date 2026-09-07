#!/usr/bin/env node

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ghostApiClient } from './ghostApi'; // Import the initialized Ghost API client
import {
    handleUserResource,
    handleMemberResource,
    handleTierResource,
    handleOfferResource,
    handleNewsletterResource,
    handlePostResource,
    handleBlogInfoResource
} from './resources'; // Import resource handlers

// Create an MCP server instance
const server = new McpServer({
    name: "ghost-mcp-ts",
    version: "1.0.0", // TODO: Get version from package.json
}, {
    capabilities: {
        resources: {}, // Capabilities will be enabled as handlers are registered
        tools: {},
        prompts: {},
        logging: {} // Enable logging capability
    }
});

// Register resource handlers
server.resource("user", new ResourceTemplate("user://{user_id}", { list: undefined }), handleUserResource);
server.resource("member", new ResourceTemplate("member://{member_id}", { list: undefined }), handleMemberResource);
server.resource("tier", new ResourceTemplate("tier://{tier_id}", { list: undefined }), handleTierResource);
server.resource("offer", new ResourceTemplate("offer://{offer_id}", { list: undefined }), handleOfferResource);
server.resource("newsletter", new ResourceTemplate("newsletter://{newsletter_id}", { list: undefined }), handleNewsletterResource);
server.resource("post", new ResourceTemplate("post://{post_id}", { list: undefined }), handlePostResource);
server.resource("blog-info", "blog://info", handleBlogInfoResource);

// Register tools — all registration goes through the hardened wrapper, which
// refuses the deny-listed names in ./policy.
import { hardened } from "./policy";
const tools = hardened(server);

import { registerPostTools } from "./tools/posts";
import { registerMemberTools } from "./tools/members";
registerPostTools(tools);
registerMemberTools(tools);
import { registerUserTools } from "./tools/users";
registerUserTools(tools);
import { registerTagTools } from "./tools/tags";
registerTagTools(tools);
import { registerTierTools } from "./tools/tiers";
registerTierTools(tools);
import { registerOfferTools } from "./tools/offers";
registerOfferTools(tools);
import { registerNewsletterTools } from "./tools/newsletters";
registerNewsletterTools(tools);

import { registerRoleTools } from "./tools/roles";
registerRoleTools(tools);

// invites and webhooks are deliberately NOT registered — see ./policy.
// Their modules remain on disk so upstream merges cleanly.

import { registerPrompts } from "./prompts";
registerPrompts(server);

// Set up and connect to the standard I/O transport
async function startServer() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Ghost MCP TypeScript Server running on stdio"); // Log to stderr
}

// Start the server
startServer().catch((error: any) => { // Add type annotation for error
    console.error("Fatal error starting server:", error);
    process.exit(1);
});