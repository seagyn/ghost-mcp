#!/usr/bin/env node
// Guard test for the hardening in src/policy.ts.
//
// The deny-list only holds because policy.ts happens to name the right tools.
// Nothing stops an upstream merge from adding a new destructive module that
// registers silently — a themes upload tool would be the dangerous one, since
// a theme ZIP can carry front-end JS for the public site.
//
// So this starts the real server, asks it over MCP what it exposes, and fails
// if anything matching a forbidden pattern is reachable. It also asserts that
// an expected-safe set IS present, otherwise a server that registered nothing
// at all would pass vacuously.
//
// No network access and no real credential: tools/list never calls Ghost, so a
// syntactically valid fake key is enough to get past the client's constructor.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Any exposed tool whose name matches one of these fails the build.
const FORBIDDEN = [
  /_delete$/, // no destructive verb on any resource
  /^webhooks_/, // arbitrary target_url is an exfiltration channel
  /^invites_/, // privilege-granting
  /^themes_/, // theme upload can carry site-wide JS
  /^settings_/, // site-wide config, incl. code injection
];

// If these are missing, registration is broken and the run above is meaningless.
const EXPECTED_PRESENT = [
  "posts_browse",
  "posts_read",
  "posts_draft_add",
  "posts_draft_edit",
  "pages_browse",
  "pages_draft_add",
  "pages_draft_edit",
];

const server = spawn(process.execPath, [join(root, "build", "server.js")], {
  stdio: ["pipe", "pipe", "pipe"],
  env: {
    ...process.env,
    GHOST_API_URL: "https://example.invalid",
    GHOST_ADMIN_API_KEY:
      "0123456789abcdef01234567:" +
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    GHOST_API_VERSION: "v5.0",
  },
});

let stdout = "";
let stderr = "";
server.stdout.on("data", (d) => (stdout += d));
server.stderr.on("data", (d) => (stderr += d));

const send = (msg) => server.stdin.write(JSON.stringify(msg) + "\n");

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "policy-guard", version: "0" },
  },
});
send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });

const fail = (msg) => {
  console.error(`\nFAIL: ${msg}`);
  if (stderr.trim()) console.error(`\nserver stderr:\n${stderr.trim()}`);
  process.exit(1);
};

const timer = setTimeout(() => {
  server.kill();
  fail("timed out waiting for tools/list");
}, 30_000);

const finish = () => {
  clearTimeout(timer);
  server.kill();

  let tools = null;
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.id === 2 && msg.result) tools = msg.result.tools.map((t) => t.name);
  }

  if (!tools) fail("server returned no tool list");

  const leaked = tools.filter((n) => FORBIDDEN.some((re) => re.test(n)));
  const missing = EXPECTED_PRESENT.filter((n) => !tools.includes(n));

  console.log(`exposed ${tools.length} tools`);

  if (missing.length) {
    fail(
      `expected tools are not registered: ${missing.join(", ")}\n` +
        `Registration is broken, so the deny-list result cannot be trusted.`
    );
  }
  if (leaked.length) {
    fail(
      `these tools are exposed but must not be: ${leaked.join(", ")}\n` +
        `Add them to DENIED_TOOLS in src/policy.ts, or stop registering them.`
    );
  }

  console.log("no forbidden tool is reachable");
  console.log(`all ${EXPECTED_PRESENT.length} expected tools present`);
  process.exit(0);
};

// tools/list is the last request; give the server a moment to flush it.
const poll = setInterval(() => {
  if (stdout.includes('"id":2')) {
    clearInterval(poll);
    setTimeout(finish, 100);
  }
}, 100);

server.on("exit", (code) => {
  clearInterval(poll);
  if (!stdout.includes('"id":2')) {
    clearTimeout(timer);
    fail(`server exited with code ${code} before answering tools/list`);
  }
});
