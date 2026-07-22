import type { PrismaClient } from "@prisma/client";
import type { UserTotal } from "./expense.repository.js";

export interface CreateSettlementInput {
  groupId: string;
  fromUserId: string;
  toUserId: string;
  amountMinor: number;
  occurredAt: Date;
}

export class SettlementRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateSettlementInput): Promise<{ id: string }> {
    return this.prisma.settlement.create({ data: input, select: { id: true } });
  }

  /** Total each user has *paid out* in settlements within a group. */
  async getPaidTotals(groupId: string): Promise<UserTotal[]> {
    const grouped = await this.prisma.settlement.groupBy({
      by: ["fromUserId"],
      where: { groupId },
      _sum: { amountMinor: true },
    });
    return grouped.map((g) => ({
      userId: g.fromUserId,
      totalMinor: g._sum.amountMinor ?? 0,
    }));
  }

  /** Total each user has *received* in settlements within a group. */
  async getReceivedTotals(groupId: string): Promise<UserTotal[]> {
    const grouped = await this.prisma.settlement.groupBy({
      by: ["toUserId"],
      where: { groupId },
      _sum: { amountMinor: true },
    });
    return grouped.map((g) => ({
      userId: g.toUserId,
      totalMinor: g._sum.amountMinor ?? 0,
    }));
  }
}
