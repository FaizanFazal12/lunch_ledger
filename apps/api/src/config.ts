import "dotenv/config";

export interface ApiConfig {
  host: string;
  port: number;
  logLevel: string;
  /** Default group used when a request omits groupId. */
  seedGroupId: string | null;
  /** Default "current user" used when a request omits userId. */
  seedUserId: string | null;
}

export function loadConfig(env: NodeJS.ProcessEnv): ApiConfig {
  return {
    host: env.HOST ?? "0.0.0.0",
    port: Number.parseInt(env.PORT ?? "3001", 10),
    logLevel: env.LOG_LEVEL ?? "info",
    seedGroupId: env.SEED_GROUP_ID && env.SEED_GROUP_ID.length > 0 ? env.SEED_GROUP_ID : null,
    seedUserId: env.SEED_USER_ID && env.SEED_USER_ID.length > 0 ? env.SEED_USER_ID : null,
  };
}
