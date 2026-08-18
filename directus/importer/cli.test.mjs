import test from "node:test";
import assert from "node:assert/strict";

import { parseCliArguments, USAGE } from "./cli.mjs";
import { PROFILE_NAMES } from "./profiles.mjs";

test("CLI defaults to a read-only dry run", () => {
  const { args, errors } = parseCliArguments([
    "--profile=operations-default",
    "--input=x.ndjson",
  ]);
  assert.deepEqual(errors, []);
  assert.equal(args.apply, false);
  assert.equal(args.profile, "operations-default");
  assert.equal(args.input, "x.ndjson");
  assert.equal(args.resume, 0);
});

test("CLI parses value flags, booleans and resume offsets", () => {
  const { args, errors } = parseCliArguments([
    "--apply",
    "--release-id=r9.2026-08-17_01",
    "--output=D:/jd-release-packets/R9",
    "--approval-ref=owner-ticket-42",
    "--resume=120",
  ]);
  assert.deepEqual(errors, []);
  assert.equal(args.apply, true);
  assert.equal(args.releaseId, "r9.2026-08-17_01");
  assert.equal(args.output, "D:/jd-release-packets/R9");
  assert.equal(args.approvalRef, "owner-ticket-42");
  assert.equal(args.resume, 120);
});

test("CLI rejects --apply together with --dry-run", () => {
  const { errors } = parseCliArguments(["--apply", "--dry-run"]);
  assert.ok(errors.some((message) => message.includes("mutually exclusive")));
});

test("CLI validates the release id charset", () => {
  const { errors } = parseCliArguments(["--release-id=bad id!"]);
  assert.ok(errors.some((message) => message.includes("release-id")));
});

test("CLI rejects malformed and unknown flags", () => {
  assert.ok(parseCliArguments(["--wat"]).errors.some((e) => e.includes("unknown")));
  assert.ok(parseCliArguments(["apply"]).errors.some((e) => e.includes("unexpected argument")));
  assert.ok(parseCliArguments(["--resume=-3"]).errors.some((e) => e.includes("resume")));
  assert.ok(parseCliArguments(["--resume=abc"]).errors.some((e) => e.includes("resume")));
  assert.ok(parseCliArguments(["--profile"]).errors.some((e) => e.includes("unknown or malformed")));
});

test("USAGE documents every flag and profile", () => {
  for (const flag of ["--profile", "--input", "--apply", "--dry-run", "--release-id", "--output", "--approval-ref", "--resume", "--rollback", "--list-profiles", "--help"]) {
    assert.ok(USAGE.includes(flag), `${flag} documented`);
  }
  for (const name of PROFILE_NAMES) {
    assert.ok(USAGE.includes(name), `${name} listed`);
  }
});
