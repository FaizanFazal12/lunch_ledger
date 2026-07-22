import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const MEMBERS = ["Ali", "Ahmed", "Hamza", "Usman", "Faizan"] as const;
const GROUP_NAME = "Office Friends";
// The person speaking to the app ("me" / "I") for the seeded demo.
const CURRENT_USER_NAME = "Faizan";

async function main(): Promise<void> {
  // Users are keyed by a synthetic email so re-seeding is idempotent.
  const users = new Map<string, string>();
  for (const name of MEMBERS) {
    const email = `${name.toLowerCase()}@lunchledger.local`;
    const user = await prisma.user.upsert({
      where: { email },
      create: { name, email },
      update: { name },
      select: { id: true, name: true },
    });
    users.set(name, user.id);
  }

  // One group. If it already exists (same name), reuse it.
  const existing = await prisma.group.findFirst({ where: { name: GROUP_NAME } });
  const group =
    existing ?? (await prisma.group.create({ data: { name: GROUP_NAME } }));

  for (const [, userId] of users) {
    await prisma.membership.upsert({
      where: { groupId_userId: { groupId: group.id, userId } },
      create: { groupId: group.id, userId },
      update: {},
    });
  }

  const currentUserId = users.get(CURRENT_USER_NAME);

  // eslint-disable-next-line no-console
  console.log("Seed complete.\n");
  console.log(`  GROUP_ID        = ${group.id}   (${GROUP_NAME})`);
  console.log(`  CURRENT_USER_ID = ${currentUserId}   (${CURRENT_USER_NAME} = "me")`);
  console.log("\n  Members:");
  for (const [name, id] of users) {
    console.log(`    ${name.padEnd(8)} ${id}`);
  }
  console.log(
    "\nPut GROUP_ID and CURRENT_USER_ID into apps/api/.env (SEED_GROUP_ID / SEED_USER_ID) " +
      "to use them as the default request context.",
  );
}

main()
  .catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
