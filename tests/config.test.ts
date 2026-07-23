import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { load } from "js-toml";
import {
  applyPortableConfig,
  extractPortableConfig,
  mergePortableConfig,
} from "../src/services/config.js";

test("extracts portable Codex settings and excludes secrets and machine state", () => {
  const portable = extractPortableConfig(`
model = "gpt-5"
model_reasoning_effort = "high"
approval_policy = "on-request"
api_key = "must-not-leak"

[features]
use_skills = true
token = "must-not-leak"

[mcp_servers.private]
url = "https://example.com"
http_headers = { Authorization = "secret" }

[projects."/private/work"]
trust_level = "trusted"

[agents.reviewer]
config_file = "agents/reviewer.toml"

[agents.machine]
config_file = "/Users/example/agent.toml"

[[skills.config]]
name = "demo"
enabled = true
path = "/Users/example/demo"
`);
  const parsed = load(portable) as Record<string, unknown>;

  assert.equal(parsed.model, "gpt-5");
  assert.equal(parsed.model_reasoning_effort, "high");
  assert.equal("api_key" in parsed, false);
  assert.equal("mcp_servers" in parsed, false);
  assert.equal("projects" in parsed, false);
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.agents)), {
    reviewer: { config_file: "agents/reviewer.toml" },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.skills)), {
    config: [{ name: "demo", enabled: true }],
  });
  assert.doesNotMatch(portable, /must-not-leak|Users\/example/u);
});

test("applies portable settings while preserving local secrets and state", () => {
  const original = `
model = "gpt-5"
api_key = "local-secret"

[features]
old_portable = true
machine_only = true

[mcp_servers.private]
url = "https://example.com"
http_headers = { Authorization = "secret" }
`;
  const previous = `
model = "gpt-5"
[features]
old_portable = true
`;
  const desired = `
model = "gpt-5.5"
[features]
new_portable = true
`;
  const updated = mergePortableConfig(original, previous, desired);
  const parsed = load(updated) as Record<string, unknown>;

  assert.equal(parsed.model, "gpt-5.5");
  assert.equal(parsed.api_key, "local-secret");
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.features)), {
    machine_only: true,
    new_portable: true,
  });
  assert.match(updated, /Authorization = "secret"/u);
  assert.doesNotMatch(updated, /old_portable/u);
});

test("does not rewrite a semantically identical base config", async () => {
  const root = await mkdtemp(join(tmpdir(), "codexkeep-config-"));
  try {
    const config = join(root, "config.toml");
    const raw = `# keep this comment
model = "gpt-5"
api_key = "local"
`;
    await writeFile(config, raw);
    const portable = extractPortableConfig(raw);
    const backup = await applyPortableConfig(
      config,
      join(root, "state"),
      portable,
      portable,
    );
    assert.equal(backup, undefined);
    assert.equal(await readFile(config, "utf8"), raw);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
