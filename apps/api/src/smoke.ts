/**
 * End-to-end smoke test that drives the agent against a real database.
 * Runs offline with the deterministic mock extractor when GOOGLE_API_KEY is unset,
 * or against Gemini when it is set. Exits non-zero if a core assertion fails.
 *
 *   pnpm --filter @lunchledger/api smoke
 *
 * Hermetic: it creates its OWN isolated group + members (not the seed group), so it
 * is unaffected by any prior data or membership changes, and cleans up afterwards.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "@lunchledger/db";
import { createCoreServices } from "@lunchledger/core";
import { createAgent } from "@lunchledger/ai";
import { formatMinor } from "@lunchledger/shared";

const FIXTURE_GROUP = "__SMOKE_TEST__";
const FIXTURE_EMAIL_DOMAIN = "smoke.local";
const MEMBERS = ["Ali", "Ahmed", "Hamza", "Usman", "Faizan"] as const;

/** Remove any leftover fixture data from a previous run. */
async function cleanupFixture(): Promise<void> {
  // Deleting the group cascades to its memberships / expenses / settlements.
  await prisma.group.deleteMany({ where: { name: FIXTURE_GROUP } });
  await prisma.user.deleteMany({
    where: { email: { endsWith: `@${FIXTURE_EMAIL_DOMAIN}` } },
  });
}

async function createFixture(): Promise<{ groupId: string; faizanId: string }> {
  const group = await prisma.group.create({ data: { name: FIXTURE_GROUP } });
  const ids = new Map<string, string>();
  for (const name of MEMBERS) {
    const user = await prisma.user.create({
      data: { name, email: `${name.toLowerCase()}@${FIXTURE_EMAIL_DOMAIN}` },
    });
    ids.set(name, user.id);
    await prisma.membership.create({ data: { groupId: group.id, userId: user.id } });
  }
  return { groupId: group.id, faizanId: ids.get("Faizan") as string };
}

async function main(): Promise<void> {
  const services = createCoreServices(prisma);
  const agent = createAgent(services, process.env);

  await cleanupFixture();
  const { groupId, faizanId } = await createFixture();

  const ctx = { groupId, currentUserId: faizanId, currentUserName: "Faizan" };
  console.log(`\nLLM provider: ${agent.llm}`);
  console.log(`Fixture group: ${FIXTURE_GROUP} (${groupId}) — members: ${MEMBERS.join(", ")}\n`);

  const say = async (message: string): Promise<string> => {
    const res = await agent.run({ message, ...ctx });
    console.log(`> ${message}`);
    console.log(`  ${res.reply.replace(/\n/g, "\n  ")}\n`);
    return res.reply;
  };

  try {
    // --- ADD_EXPENSE: Ali pays 2500 for everyone (5 members) -> each share 500 ---
    await say("Ali paid 2500 today.");

    // --- SHOW_BALANCE: expect Ali +2000, everyone else -500 ---
    const balanceReply = await say("Show me the balances.");
    assert.match(balanceReply, /Ali: is owed 2000/i, "SHOW_BALANCE reply should list Ali's balance");

    const balances = await services.balanceService.getGroupBalances(groupId);
    const byName = new Map(balances.balances.map((b) => [b.name, b.balanceMinor]));
    assert.equal(byName.get("Ali"), 200000, "Ali should be owed 2000");
    for (const name of ["Ahmed", "Hamza", "Usman", "Faizan"]) {
      assert.equal(byName.get(name), -50000, `${name} should owe 500`);
    }
    console.log("✓ ADD_EXPENSE + SHOW_BALANCE balances are correct.");

    // --- ADD_EXPENSE with subset: only Ali and Ahmed, Ahmed pays 1000 -> each 500 ---
    await say("Ahmed paid 1000. Only Ali and Ahmed went.");
    const m2 = mapBalances(await services.balanceService.getGroupBalances(groupId));
    // Ali: +2000 (prev) -500 (share) = +1500 ; Ahmed: -500 +1000 -500 = 0
    assert.equal(m2.get("Ali"), 150000, "Ali should now be owed 1500");
    assert.equal(m2.get("Ahmed"), 0, "Ahmed should be settled up");
    console.log("✓ Subset expense split is correct.");

    // --- SETTLE_PAYMENT: Faizan pays Ali 500 ---
    await say("Faizan paid Ali 500.");
    const m3 = mapBalances(await services.balanceService.getGroupBalances(groupId));
    // Faizan: -500 +500(settle out) = 0 ; Ali: +1500 -500(settle in) = +1000
    assert.equal(m3.get("Faizan"), 0, "Faizan should be settled after paying Ali");
    assert.equal(m3.get("Ali"), 100000, "Ali should now be owed 1000");
    console.log("✓ Settlement updates balances correctly.");

    // --- Clarification path: unknown name ---
    const clarifyReply = await say("Bilal paid 800 for me and Bilal.");
    assert.match(clarifyReply, /Bilal is not a member/i, "Unknown name should trigger clarification");
    console.log("✓ Unknown participant triggers a clarification.");

    console.log(`\nAll smoke assertions passed. Final: Ali is owed ${formatMinor(m3.get("Ali") ?? 0)}.\n`);
  } finally {
    await cleanupFixture();
  }
}

function mapBalances(b: { balances: { name: string; balanceMinor: number }[] }): Map<string, number> {
  return new Map(b.balances.map((x) => [x.name, x.balanceMinor]));
}

main()
  .catch((err: unknown) => {
    console.error("\n✗ Smoke test failed:\n", err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
