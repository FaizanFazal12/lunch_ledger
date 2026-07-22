export { createCoreServices } from "./container.js";
export type { CoreServices } from "./container.js";

// Re-exported so upstream layers (AI) can type against members without depending on db.
export type { GroupMember } from "@lunchledger/db";

export { DomainError, isDomainError } from "./errors.js";
export type { DomainErrorCode } from "./errors.js";

export { resolveDate } from "./date.js";

export { ExpenseService } from "./services/expense.service.js";
export type {
  CreateExpenseCommand,
  CreateExpenseResult,
} from "./services/expense.service.js";

export { BalanceService } from "./services/balance.service.js";
export { SettlementService } from "./services/settlement.service.js";
export type { CreateSettlementCommand } from "./services/settlement.service.js";
export { GroupService } from "./services/group.service.js";
export { HistoryService } from "./services/history.service.js";
export type { HistoryQuery } from "./services/history.service.js";

export {
  MemberService,
  resolveName,
  resolveParticipants,
} from "./services/member.service.js";
export type {
  ResolvedParticipants,
  ResolvedName,
} from "./services/member.service.js";
