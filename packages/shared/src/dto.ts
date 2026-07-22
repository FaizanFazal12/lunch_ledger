/**
 * Plain data-transfer shapes shared across layers (services -> api -> ai response).
 * These are framework-agnostic and contain no Prisma types.
 */

export interface MemberBalance {
  userId: string;
  name: string;
  /** Net balance in minor units. Positive = is owed money; negative = owes money. */
  balanceMinor: number;
}

export interface GroupBalances {
  groupId: string;
  groupName: string;
  balances: MemberBalance[];
}

export interface ExpenseParticipantView {
  name: string;
  isGuest: boolean;
  shareMinor: number;
}

export interface ExpenseView {
  id: string;
  payerName: string;
  amountMinor: number;
  description: string | null;
  occurredAt: string; // ISO date
  participants: ExpenseParticipantView[];
}
