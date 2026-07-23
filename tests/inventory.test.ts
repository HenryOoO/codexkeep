import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeInventories,
  migrateLegacyInventory,
  missingInventory,
  parseInventory,
} from "../src/domain/inventory.js";

test("migrates legacy plugin inventory into stable JSON data", () => {
  const inventory = migrateLegacyInventory(`
# comment
plugin|demo@custom
marketplace|custom|https://example.com/custom.git
account|github|GitHub
plugin|demo@custom
`);

  assert.deepEqual(inventory, {
    version: 1,
    marketplaces: [
      { name: "custom", source: "https://example.com/custom.git" },
    ],
    plugins: ["demo@custom"],
    accountPlugins: [{ id: "github", name: "GitHub" }],
  });
});

test("normalizes merged inventories and reports missing local items", () => {
  const repository = parseInventory(`{
    "version": 1,
    "marketplaces": [{"name":"custom","source":"https://example.com/custom.git"}],
    "plugins": ["demo@custom"],
    "accountPlugins": []
  }`);
  const remote = parseInventory(`{
    "version": 1,
    "marketplaces": [{"name":"other","source":"git@github.com:example/other.git"}],
    "plugins": ["other@other"],
    "accountPlugins": [{"id":"github","name":"GitHub"}]
  }`);
  const merged = mergeInventories(repository, remote);
  const missing = missingInventory(merged, repository);

  assert.deepEqual(missing.marketplaces, [
    { name: "other", source: "git@github.com:example/other.git" },
  ]);
  assert.deepEqual(missing.plugins, ["other@other"]);
  assert.deepEqual(missing.accountPlugins, [{ id: "github", name: "GitHub" }]);
});

test("rejects credentials and query strings in marketplace sources", () => {
  assert.throws(
    () =>
      parseInventory(`{
        "version": 1,
        "marketplaces": [{"name":"bad","source":"https://user:token@example.com/repo.git?key=x"}],
        "plugins": [],
        "accountPlugins": []
      }`),
    /unsafe or unsupported source/u,
  );
});

test("rejects conflicting marketplace names", () => {
  const left = migrateLegacyInventory(
    "marketplace|custom|https://example.com/one.git",
  );
  const right = migrateLegacyInventory(
    "marketplace|custom|https://example.com/two.git",
  );
  assert.throws(() => mergeInventories(left, right), /Conflicting inventory/u);
});
