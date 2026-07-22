import { test } from "node:test";
import assert from "node:assert/strict";
import { splitEqually, toMinorUnits } from "@lunchledger/shared";
import { resolveParticipants } from "./member.service.js";
import type { Extraction } from "@lunchledger/shared";

test("splitEqually distributes evenly and sums exactly", () => {
  const shares = splitEqually(toMinorUnits(2500), 5);
  assert.deepEqual(shares, [50000, 50000, 50000, 50000, 50000]);
  assert.equal(
    shares.reduce((a, b) => a + b, 0),
    toMinorUnits(2500),
  );
});

test("splitEqually handles indivisible remainder deterministically", () => {
  const shares = splitEqually(toMinorUnits(2500), 3);
  assert.equal(
    shares.reduce((a, b) => a + b, 0),
    toMinorUnits(2500),
  );
  // 250000 / 3 -> 83334, 83333, 83333
  assert.deepEqual(shares, [83334, 83333, 83333]);
});

const MEMBERS = [
  { userId: "u_ali", name: "Ali" },
  { userId: "u_ahmed", name: "Ahmed" },
  { userId: "u_hamza", name: "Hamza" },
  { userId: "u_usman", name: "Usman" },
  { userId: "u_faizan", name: "Faizan" },
];

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

test("resolveParticipants: everyone except Hamza", () => {
  const res = resolveParticipants(
    MEMBERS,
    "u_faizan",
    extraction({ participantMode: "all_except", excluded: ["Hamza"] }),
  );
  assert.deepEqual(res.userIds, ["u_ali", "u_ahmed", "u_usman", "u_faizan"]);
  assert.deepEqual(res.unknownNames, []);
});

test("resolveParticipants: only Ali and me", () => {
  const res = resolveParticipants(
    MEMBERS,
    "u_faizan",
    extraction({ participantMode: "only", names: ["Ali", "me"] }),
  );
  assert.deepEqual(res.userIds, ["u_ali", "u_faizan"]);
});

test("resolveParticipants: unknown name is flagged", () => {
  const res = resolveParticipants(
    MEMBERS,
    "u_faizan",
    extraction({ participantMode: "only", names: ["Ali", "Bilal"] }),
  );
  assert.deepEqual(res.userIds, ["u_ali"]);
  assert.deepEqual(res.unknownNames, ["Bilal"]);
});
