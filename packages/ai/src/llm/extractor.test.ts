/**
 * The offline mock extractor is what keeps the graph, tests and demo runnable with
 * no API key. These cases are the natural-language examples from the product spec,
 * so a regression here means the offline path stopped understanding the demo script.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Extraction } from "@lunchledger/shared";
import { MockExtractor } from "./extractor.js";

const CONTEXT = {
  members: ["Ali", "Ahmed", "Hamza", "Usman", "Faizan"],
  currentUserName: "Faizan",
};

const extractor = new MockExtractor();
const parse = (message: string): Promise<Extraction> => extractor.extract(message, CONTEXT);

// --- ADD_EXPENSE -----------------------------------------------------------

test("a bare payment means everyone took part", async () => {
  const r = await parse("Ali paid 2400.");
  assert.equal(r.intent, "ADD_EXPENSE");
  assert.equal(r.payer, "Ali");
  assert.equal(r.amount, 2400);
  // "unspecified" (not "only Ali") — the resolver defaults it to the whole group.
  assert.equal(r.participantMode, "unspecified");
});

test("only Ali and Ahmed went", async () => {
  const r = await parse("Ali paid 2400. Only Ali and Ahmed went.");
  assert.equal(r.intent, "ADD_EXPENSE");
  assert.equal(r.payer, "Ali");
  assert.equal(r.participantMode, "only");
  assert.deepEqual(r.names, ["Ali", "Ahmed"]);
});

test("everyone except Hamza", async () => {
  const r = await parse("Ali paid 2500. Everyone except Hamza.");
  assert.equal(r.intent, "ADD_EXPENSE");
  assert.equal(r.participantMode, "all_except");
  assert.deepEqual(r.excluded, ["Hamza"]);
});

test("a non-member is captured verbatim so the graph can ask about them", async () => {
  const r = await parse("Me, Ali and Bilal had lunch.");
  assert.equal(r.intent, "ADD_EXPENSE");
  assert.equal(r.participantMode, "only");
  assert.deepEqual(r.names, ["me", "Ali", "Bilal"]);
  assert.equal(r.amount, null, "no amount was stated");
});

test("paid for everyone", async () => {
  const r = await parse("Ahmed paid for everyone.");
  assert.equal(r.intent, "ADD_EXPENSE");
  assert.equal(r.payer, "Ahmed");
  assert.equal(r.participantMode, "all");
});

test("for himself and me", async () => {
  const r = await parse("Ali paid 1800 for himself and me.");
  assert.equal(r.intent, "ADD_EXPENSE");
  assert.equal(r.payer, "Ali");
  assert.equal(r.amount, 1800);
  assert.equal(r.participantMode, "only");
  assert.deepEqual(r.names, ["Ali", "me"]);
});

test("first person is normalised to \"me\"", async () => {
  const r = await parse("I paid 900 today.");
  assert.equal(r.intent, "ADD_EXPENSE");
  assert.equal(r.payer, "me");
  assert.equal(r.amount, 900);
  assert.equal(r.dateText, "today");
});

// --- SETTLE_PAYMENT --------------------------------------------------------

test("<name> paid <name> <amount> is a settlement, not an expense", async () => {
  const r = await parse("Ahmed paid Ali 500.");
  assert.equal(r.intent, "SETTLE_PAYMENT");
  assert.equal(r.settleFrom, "Ahmed");
  assert.equal(r.settleTo, "Ali");
  assert.equal(r.amount, 500);
});

test("\"gave\" is a settlement", async () => {
  const r = await parse("I gave Hamza 700.");
  assert.equal(r.intent, "SETTLE_PAYMENT");
  assert.equal(r.settleFrom, "me");
  assert.equal(r.settleTo, "Hamza");
  assert.equal(r.amount, 700);
});

// --- Queries ---------------------------------------------------------------

test("balance and recommendation questions", async () => {
  assert.equal((await parse("who owes what?")).intent, "SHOW_BALANCE");
  assert.equal((await parse("Who should pay tomorrow?")).intent, "WHO_SHOULD_PAY");
});

test("history questions carry the period they asked for", async () => {
  const today = await parse("Show today's expenses.");
  assert.equal(today.intent, "SHOW_HISTORY");
  assert.equal(today.dateText, "today");

  const lastWeek = await parse("Show last week's lunches.");
  assert.equal(lastWeek.intent, "SHOW_HISTORY");
  assert.equal(lastWeek.dateText, "last week");

  const thisMonth = await parse("Show all expenses this month.");
  assert.equal(thisMonth.intent, "SHOW_HISTORY");
  assert.equal(thisMonth.dateText, "this month");
});

// --- Membership ------------------------------------------------------------

test("membership changes", async () => {
  const add = await parse("Add Bilal permanently.");
  assert.equal(add.intent, "ADD_MEMBER");
  assert.equal(add.targetName, "Bilal");

  const remove = await parse("Remove Usman from the group.");
  assert.equal(remove.intent, "REMOVE_MEMBER");
  assert.equal(remove.targetName, "Usman");
});

// --- Dates -----------------------------------------------------------------

test("relative dates on an expense", async () => {
  assert.equal((await parse("Ali paid 2500 yesterday.")).dateText, "yesterday");
  assert.equal((await parse("Ali paid 2500 3 days ago.")).dateText, "3 days ago");
  assert.equal((await parse("Ali paid 2500 on 2026-07-20.")).dateText, "2026-07-20");
  assert.equal((await parse("Ali paid 2500.")).dateText, null);
});

// --- Fallback --------------------------------------------------------------

test("an unrelated message is UNKNOWN rather than a wrong guess", async () => {
  const r = await parse("What is the weather like?");
  assert.equal(r.intent, "UNKNOWN");
});
