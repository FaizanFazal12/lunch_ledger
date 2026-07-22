import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { prisma } from "@lunchledger/db";
import { createCoreServices, type CoreServices } from "@lunchledger/core";
import { createAgent, type Agent } from "@lunchledger/ai";
import { loadConfig, type ApiConfig } from "./config.js";

const MessageBodySchema = z.object({
  message: z.string().min(1, "message is required"),
  groupId: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
});

export interface AppContext {
  config: ApiConfig;
  services: CoreServices;
  agent: Agent;
}

export function buildContext(env: NodeJS.ProcessEnv): AppContext {
  const config = loadConfig(env);
  const services = createCoreServices(prisma);
  const agent = createAgent(services, env);
  return { config, services, agent };
}

export async function buildApp(ctx: AppContext): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: ctx.config.logLevel } });
  await app.register(cors, { origin: true });

  app.get("/health", async () => ({ status: "ok", llm: ctx.agent.llm }));

  app.post("/ai/message", async (request, reply) => {
    const parsed = MessageBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: parsed.error.issues.map((i) => i.message).join(", "),
      });
    }

    const groupId = parsed.data.groupId ?? ctx.config.seedGroupId;
    if (groupId === null) {
      return reply.status(400).send({
        success: false,
        error: "No groupId provided and no SEED_GROUP_ID configured. Run the seed script.",
      });
    }
    const currentUserId = parsed.data.userId ?? ctx.config.seedUserId;

    // Resolve the speaker's display name (for "me") from the group's members.
    const members = await ctx.services.groups.listMembers(groupId);
    const currentUserName =
      currentUserId !== null
        ? (members.find((m) => m.userId === currentUserId)?.name ?? null)
        : null;

    const result = await ctx.agent.run({
      message: parsed.data.message,
      groupId,
      currentUserId,
      currentUserName,
    });

    return reply.send({
      success: result.clarification === null,
      reply: result.reply,
      data: {
        intent: result.intent,
        clarification: result.clarification,
        result: result.data,
      },
    });
  });

  return app;
}
