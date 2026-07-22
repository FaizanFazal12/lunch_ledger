import { buildApp, buildContext } from "./app.js";

async function main(): Promise<void> {
  const ctx = buildContext(process.env);
  const app = await buildApp(ctx);

  try {
    await app.listen({ host: ctx.config.host, port: ctx.config.port });
    app.log.info(`LunchLedger AI API listening — LLM provider: ${ctx.agent.llm}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
