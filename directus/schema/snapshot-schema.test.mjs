import test from "node:test";
import assert from "node:assert/strict";

import { serializeSnapshot } from "./snapshot-schema.mjs";

test("serializes a reproducible pretty-printed snapshot", () => {
  assert.equal(
    serializeSnapshot({ version: 1, collections: [] }),
    '{\n  "version": 1,\n  "collections": []\n}\n',
  );
});
