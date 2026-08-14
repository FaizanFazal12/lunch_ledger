import { test } from "node:test";
import assert from "node:assert/strict";
import type { Extraction } from "@lunchledger/shared";
import { resolveName, resolveParticipants } from "./member.service.js";

const MEMBERS = [
  { userId: "u_ali", name: "Ali" },
  { userId: "u_ahmed", name: "Ahmed" },
  { userId: "u_hamza", name: "Hamza" },
  { userId: "u_usman", name: "Usman" },
  { userId: "u_faizan", name: "Faizan" },
];
const ALL = MEMBERS.map((m) => m.userId);
const ME = "u_faizan";

function extraction(partial: Partial<Extraction>): Extraction {
  return {
    intent: "ADD_EXPENSE",
    amount: null,
    payer: null,
    participantMode: "unspecified",
    names: [],
    excluded: [],
    settleFrom: null,
    settleTo: null,
    targetName: null,
    dateText: null,
    description: null,
    ...partial,
  };
}

// --- resolveName -----------------------------------------------------------

test("resolveName: matches members regardless of case and padding", () => {
  assert.deepEqual(resolveName(MEMBERS, ME, "  aLi "), {
    userId: "u_ali",
    unknownName: null,
  });
});

test("resolveName: every self-alias resolves to the current user", () => {
  for (const alias of ["me", "Me", "myself", "I", "self"]) {
    assert.equal(resolveName(MEMBERS, ME, alias).userId, ME, `alias: ${alias}`);
  }
});

test("resolveName: a self-alias with no known speaker is neither resolved nor unknown", () => {
  // Nothing to clarify — we simply don't know who is talking.
  assert.deepEqual(resolveName(MEMBERS, null, "me"), { userId: null, unknownName: null });
});

test("resolveName: a non-member is reported verbatim for clarification", () => {
  assert.deepEqual(resolveName(MEMBERS, ME, "Bilal"), {
    userId: null,
    unknownName: "Bilal",
  });
});

// --- resolveParticipants ---------------------------------------------------

test("resolveParticipants: unspecified and all both mean everyone", () => {
  assert.deepEqual(resolveParticipants(MEMBERS, ME, extraction({})).userIds, ALL);
  assert.deepEqual(
    resolveParticipants(MEMBERS, ME, extraction({ participantMode: "all" })).userIds,
    ALL,
  );
});

test("resolveParticipants: everyone except Hamza", () => {
  const res = resolveParticipants(
    MEMBERS,
    ME,
    extraction({ participantMode: "all_except", excluded: ["Hamza"] }),
  );
  assert.deepEqual(res.userIds, ["u_ali", "u_ahmed", "u_usman", "u_faizan"]);
  assert.deepEqual(res.unknownNames, []);
});

test("resolveParticipants: everyone except me", () => {
  const res = resolveParticipants(
    MEMBERS,
    ME,
    extraction({ participantMode: "all_except", excluded: ["me"] }),
  );
  assert.deepEqual(res.userIds, ["u_ali", "u_ahmed", "u_hamza", "u_usman"]);
});

test("resolveParticipants: only Ali and me", () => {
  const res = resolveParticipants(
    MEMBERS,
    ME,
    extraction({ participantMode: "only", names: ["Ali", "me"] }),
  );
  assert.deepEqual(res.userIds, ["u_ali", "u_faizan"]);
});

test("resolveParticipants: repeated names collapse to one share", () => {
  const res = resolveParticipants(
    MEMBERS,
    ME,
    extraction({ participantMode: "only", names: ["Ali", "ali", "ALI"] }),
  );
  assert.deepEqual(res.userIds, ["u_ali"]);
});

test("resolveParticipants: an unknown name is flagged, known ones still resolve", () => {
  const res = resolveParticipants(
    MEMBERS,
    ME,
    extraction({ participantMode: "only", names: ["Ali", "Bilal"] }),
  );
  assert.deepEqual(res.userIds, ["u_ali"]);
  assert.deepEqual(res.unknownNames, ["Bilal"]);
});

test("resolveParticipants: an unknown exclusion is flagged rather than ignored", () => {
  // "everyone except Bilal" must not silently charge the whole group.
  const res = resolveParticipants(
    MEMBERS,
    ME,
    extraction({ participantMode: "all_except", excluded: ["Bilal"] }),
  );
  assert.deepEqual(res.unknownNames, ["Bilal"]);
});

test("resolveParticipants: names alongside 'all' do not duplicate members", () => {
  const res = resolveParticipants(
    MEMBERS,
    ME,
    extraction({ participantMode: "all", names: ["Ali"] }),
  );
  assert.deepEqual(res.userIds, ALL);
});

test("resolveParticipants: 'only me' with no known speaker yields nobody", () => {
  // The graph turns an empty participant list into "Who took part in this expense?".
  const res = resolveParticipants(
    MEMBERS,
    null,
    extraction({ participantMode: "only", names: ["me"] }),
  );
  assert.deepEqual(res.userIds, []);
  assert.deepEqual(res.unknownNames, []);
});
