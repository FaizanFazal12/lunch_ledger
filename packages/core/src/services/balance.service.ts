import type { GroupBalances, MemberBalance } from "@lunchledger/shared";
import type {
  ExpenseRepository,
  GroupRepository,
  SettlementRepository,
  UserTotal,
} from "@lunchledger/db";
import { DomainError } from "../errors.js";

/**
 * Deterministically derives running balances from the ledger (expenses + settlements).
 * We never store a mutable "balance" column — it's always recomputed, so it can't drift.
 *
 * For a user u:
 *   balance = paidInExpenses - sharesOwed + settlementsPaid - settlementsReceived
 * Positive  => u is owed money.
 * Negative  => u owes money.
 */
export class BalanceService {
  constructor(
    private readonly groups: GroupRepository,
    private readonly expenses: ExpenseRepository,
    private readonly settlements: SettlementRepository,
  ) {}

  async getGroupBalances(groupId: string): Promise<GroupBalances> {
    const group = await this.groups.findById(groupId);
    if (group === null) {
      throw new DomainError("NOT_FOUND", "That group does not exist.");
    }

    const members = await this.groups.listMembers(groupId);
    const [paid, shares, settledOut, settledIn] = await Promise.all([
      this.expenses.getPaidTotals(groupId),
      this.expenses.getShareTotals(groupId),
      this.settlements.getPaidTotals(groupId),
      this.settlements.getReceivedTotals(groupId),
    ]);

    const paidMap = toMap(paid);
    const sharesMap = toMap(shares);
    const settledOutMap = toMap(settledOut);
    const settledInMap = toMap(settledIn);

    const balances: MemberBalance[] = members.map((m) => {
      const balanceMinor =
        (paidMap.get(m.userId) ?? 0) -
        (sharesMap.get(m.userId) ?? 0) +
        (settledOutMap.get(m.userId) ?? 0) -
        (settledInMap.get(m.userId) ?? 0);
      return { userId: m.userId, name: m.name, balanceMinor };
    });

    return { groupId: group.id, groupName: group.name, balances };
  }
}

function toMap(totals: UserTotal[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of totals) map.set(t.userId, t.totalMinor);
  return map;
}
