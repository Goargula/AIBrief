import assert from "node:assert/strict";
import { test } from "node:test";

import { prioritizeSharedStory } from "../public/story-order.js";

test("prioritizeSharedStory moves a linked story first and preserves the rest of the order", () => {
  const items = [{ id: "first" }, { id: "linked" }, { id: "third" }, { id: "fourth" }];

  assert.deepEqual(
    prioritizeSharedStory(items, "linked").map((item) => item.id),
    ["linked", "first", "third", "fourth"]
  );
});

test("prioritizeSharedStory leaves order unchanged when the linked story is already first or missing", () => {
  const items = [{ id: "first" }, { id: "second" }];

  assert.equal(prioritizeSharedStory(items, "first"), items);
  assert.equal(prioritizeSharedStory(items, "missing"), items);
  assert.equal(prioritizeSharedStory(items, ""), items);
});
