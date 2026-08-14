import type { CoreServices } from "@lunchledger/core";
import type {
  CreateExpenseResult,
  GroupMember,
  HistoryQuery,
} from "@lunchledger/core";
import type { ExpenseView, GroupBalances } from "@lunchledger/shared";

/**
 * The Tool Layer. These are the ONLY things the graph's executor node may call.
 * Each tool wraps an application service; no node ever touches Prisma directly.
 *
 * Kept as typed functions (not model-bound LangChain tools) so returns stay fully
 * typed and money math stays deterministic. Binding these to Gemini for native
 * function-calling is a straightforward future enhancement.
 */
export interface Tools {
  /** The group's permanent members. Nodes use this instead of reaching for services. */
  getMembers(input: { groupId: string }): Promise<GroupMember[]>;

  createExpense(input: {
    groupId: string;
    payerId: string;
    participantUserIds: string[];
    guestNames: string[];
    amountMajor: number;
    description: string | null;
    occurredAt: Date;
  }): Promise<CreateExpenseResult>;

  getBalances(input: { groupId: string }): Promise<GroupBalances>;

  createSettlement(input: {
    groupId: string;
    fromUserId: string;
    toUserId: string;
    amountMajor: number;
    occurredAt: Date;
  }): Promise<{ settlementId: string }>;

  getHistory(input: HistoryQuery): Promise<ExpenseView[]>;

  createGroup(input: { name: string }): Promise<{ groupId: string; name: string }>;

  addMember(input: { groupId: string; name: string }): Promise<{ userId: string }>;

  removeMember(input: { groupId: string; userId: string }): Promise<void>;
}

export function createTools(services: CoreServices): Tools {
  return {
    getMembers: (input) => services.groups.listMembers(input.groupId),

    createExpense: (input) =>
      services.expenseService.createExpense({
        groupId: input.groupId,
        payerId: input.payerId,
        amountMajor: input.amountMajor,
        participantUserIds: input.participantUserIds,
        guestNames: input.guestNames,
        description: input.description,
        occurredAt: input.occurredAt,
      }),

    getBalances: (input) => services.balanceService.getGroupBalances(input.groupId),

    createSettlement: (input) =>
      services.settlementService.settle({
        groupId: input.groupId,
        fromUserId: input.fromUserId,
        toUserId: input.toUserId,
        amountMajor: input.amountMajor,
        occurredAt: input.occurredAt,
      }),

    getHistory: (input) => services.historyService.getHistory(input),

    createGroup: (input) => services.groupService.createGroup(input.name),

    addMember: (input) => services.memberService.addPermanentMember(input.groupId, input.name),

    removeMember: (input) => services.memberService.removeMember(input.groupId, input.userId),
  };
}
