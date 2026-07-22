import {
  ExpenseRepository,
  GroupRepository,
  SettlementRepository,
  UserRepository,
  type PrismaClient,
} from "@lunchledger/db";
import { ExpenseService } from "./services/expense.service.js";
import { BalanceService } from "./services/balance.service.js";
import { SettlementService } from "./services/settlement.service.js";
import { GroupService } from "./services/group.service.js";
import { HistoryService } from "./services/history.service.js";
import { MemberService } from "./services/member.service.js";

/**
 * The composition root for the business layer. Give it a PrismaClient and it wires
 * up repositories + services (simple constructor injection). The AI and API layers
 * depend on this interface, never on Prisma directly.
 */
export interface CoreServices {
  groups: GroupRepository;
  expenseService: ExpenseService;
  balanceService: BalanceService;
  settlementService: SettlementService;
  groupService: GroupService;
  historyService: HistoryService;
  memberService: MemberService;
}

export function createCoreServices(prisma: PrismaClient): CoreServices {
  const groupRepo = new GroupRepository(prisma);
  const userRepo = new UserRepository(prisma);
  const expenseRepo = new ExpenseRepository(prisma);
  const settlementRepo = new SettlementRepository(prisma);

  return {
    groups: groupRepo,
    expenseService: new ExpenseService(expenseRepo),
    balanceService: new BalanceService(groupRepo, expenseRepo, settlementRepo),
    settlementService: new SettlementService(settlementRepo),
    groupService: new GroupService(groupRepo),
    historyService: new HistoryService(expenseRepo),
    memberService: new MemberService(groupRepo, userRepo),
  };
}
