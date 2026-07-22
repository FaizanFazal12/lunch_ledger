/**
 * Interactive terminal chat for the LunchLedger AI agent.
 * Type natural-language messages and see the agent act on the database in real time —
 * no HTTP server needed. Uses Gemini when GOOGLE_API_KEY is set, else the offline mock.
 *
 *   pnpm chat
 *
 * Built-in commands: /help  /members  /balance  /history  /group <id>  /whoami  /quit
 */
import "dotenv/config";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { prisma } from "@lunchledger/db";
import { createCoreServices, type CoreServices } from "@lunchledger/core";
import { createAgent, type Agent } from "@lunchledger/ai";
import { loadConfig } from "./config.js";

interface Session {
  groupId: string;
  groupName: string;
  currentUserId: string | null;
  currentUserName: string | null;
}

async function resolveSession(services: CoreServices): Promise<Session> {
  const config = loadConfig(process.env);

  // Prefer the configured seed context; otherwise fall back to the first group.
  let groupId = config.seedGroupId;
  if (groupId === null) {
    const first = await prisma.group.findFirst({ orderBy: { createdAt: "asc" } });
    if (first === null) {
      throw new Error(
        "No groups found. Run `pnpm db:seed` first (or create one: type `create group ...`).",
      );
    }
    groupId = first.id;
  }

  const group = await services.groups.findById(groupId);
  if (group === null) {
    throw new Error(`Configured SEED_GROUP_ID ${groupId} does not exist. Run \`pnpm db:seed\`.`);
  }

  const members = await services.groups.listMembers(groupId);
  const currentUserId = config.seedUserId;
  const currentUserName =
    currentUserId !== null
      ? (members.find((m) => m.userId === currentUserId)?.name ?? null)
      : null;

  return { groupId: group.id, groupName: group.name, currentUserId, currentUserName };
}

function banner(agent: Agent, session: Session): string {
  const providerLabels = {
    openrouter: "OpenRouter",
    gemini: "Gemini",
    mock: "offline mock",
  } as const;
  const provider = providerLabels[agent.llm];
  return [
    "",
    "  🍱  LunchLedger AI — terminal chat",
    `      provider: ${provider}   group: ${session.groupName}   you: ${session.currentUserName ?? "(unset)"}`,
    "",
    "  Try:  \"Ali paid 2500. Everyone except Hamza.\"",
    "        \"who owes what?\"        \"Ahmed gave Ali 500\"        \"show recent lunches\"",
    "  Commands: /help /members /balance /history /whoami /quit",
    "",
  ].join("\n");
}

async function printMembers(services: CoreServices, session: Session): Promise<void> {
  const members = await services.groups.listMembers(session.groupId);
  console.log(`  Members of ${session.groupName}:`);
  for (const m of members) {
    const you = m.userId === session.currentUserId ? "  (you)" : "";
    console.log(`    • ${m.name}${you}`);
  }
}

/** Returns true if the input was a local command (already handled). */
async function handleCommand(
  line: string,
  agent: Agent,
  services: CoreServices,
  session: Session,
): Promise<boolean> {
  const [cmd] = line.slice(1).trim().split(/\s+/);
  switch (cmd) {
    case "help":
      console.log(banner(agent, session));
      return true;
    case "members":
      await printMembers(services, session);
      return true;
    case "whoami":
      console.log(`  You are: ${session.currentUserName ?? "(no current user set)"}`);
      return true;
    case "balance":
      await runMessage("show me the balances", agent, session);
      return true;
    case "history":
      await runMessage("show recent expenses", agent, session);
      return true;
    default:
      console.log(`  Unknown command "/${cmd ?? ""}". Type /help.`);
      return true;
  }
}

async function runMessage(message: string, agent: Agent, session: Session): Promise<void> {
  try {
    const res = await agent.run({
      message,
      groupId: session.groupId,
      currentUserId: session.currentUserId,
      currentUserName: session.currentUserName,
    });
    const prefix = res.clarification !== null ? "  ❓ " : "  🤖 ";
    console.log(`${prefix}${res.reply.replace(/\n/g, "\n     ")}\n`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/429|quota|rate.?limit/i.test(msg)) {
      console.log(
        "  ⚠️  Gemini free-tier quota reached (20 requests/day).\n" +
          "      Wait for it to reset, or run offline with the mock parser:\n" +
          "      GOOGLE_API_KEY=\"\" pnpm chat\n",
      );
      return;
    }
    console.log(`  ⚠️  Something went wrong: ${msg}\n`);
  }
}

/** Handle one line of input. Returns "quit" when the session should end. */
async function processLine(
  raw: string,
  agent: Agent,
  services: CoreServices,
  session: Session,
): Promise<"continue" | "quit"> {
  const line = raw.trim();
  if (line.length === 0) return "continue";
  if (line === "/quit" || line === "/exit" || line === "exit") return "quit";
  if (line.startsWith("/")) {
    await handleCommand(line, agent, services, session);
    return "continue";
  }
  await runMessage(line, agent, session);
  return "continue";
}

/** Interactive mode: a prompt loop for a real terminal (TTY). */
async function runInteractive(
  agent: Agent,
  services: CoreServices,
  session: Session,
): Promise<void> {
  const rl = readline.createInterface({ input, output });
  let quitting = false;
  rl.on("SIGINT", () => {
    quitting = true;
    rl.close();
  });

  try {
    while (!quitting) {
      let line: string;
      try {
        line = await rl.question("  you ▸ ");
      } catch {
        break; // interface closed (Ctrl-D / EOF)
      }
      if ((await processLine(line, agent, services, session)) === "quit") break;
    }
  } finally {
    rl.close();
  }
}

/** Batch mode: stdin is piped (e.g. `echo ... | pnpm chat`). Process every line in order. */
async function runBatch(agent: Agent, services: CoreServices, session: Session): Promise<void> {
  let data = "";
  input.setEncoding("utf8");
  for await (const chunk of input) data += chunk;
  for (const raw of data.split(/\r?\n/)) {
    if (raw.trim().length > 0) console.log(`  you ▸ ${raw.trim()}`);
    if ((await processLine(raw, agent, services, session)) === "quit") break;
  }
}

async function main(): Promise<void> {
  const services = createCoreServices(prisma);
  const agent = createAgent(services, process.env);
  const session = await resolveSession(services);

  console.log(banner(agent, session));

  try {
    if (input.isTTY) await runInteractive(agent, services, session);
    else await runBatch(agent, services, session);
  } finally {
    await prisma.$disconnect();
    console.log("  Bye! 👋");
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
