import type { PrismaClient } from "@prisma/client";

export interface ExpenseParticipantInput {
  userId: string;
  shareMinor: number;
}

export interface ExpenseGuestInput {
  name: string;
  shareMinor: number;
}

export interface CreateExpenseInput {
  groupId: string;
  payerId: string;
  amountMinor: number;
  description: string | null;
  occurredAt: Date;
  participants: ExpenseParticipantInput[];
  guests: ExpenseGuestInput[];
}

export interface ExpenseRecord {
  id: string;
  groupId: string;
  payerId: string;
  payerName: string;
  amountMinor: number;
  description: string | null;
  occurredAt: Date;
  participants: { userId: string; name: string; shareMinor: number }[];
  guests: { name: string; shareMinor: number }[];
}

/** Sum of a numeric aggregate keyed by a user id. */
export interface UserTotal {
  userId: string;
  totalMinor: number;
}

export class ExpenseRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** Create an expense and its participant/guest shares atomically. */
  async create(input: CreateExpenseInput): Promise<{ id: string }> {
    const created = await this.prisma.expense.create({
      data: {
        groupId: input.groupId,
        payerId: input.payerId,
        amountMinor: input.amountMinor,
        description: input.description,
        occurredAt: input.occurredAt,
        participants: {
          create: input.participants.map((p) => ({
            userId: p.userId,
            shareMinor: p.shareMinor,
          })),
        },
        guests: {
          create: input.guests.map((g) => ({
            name: g.name,
            shareMinor: g.shareMinor,
          })),
        },
      },
      select: { id: true },
    });
    return created;
  }

  async listByGroup(
    groupId: string,
    range?: { from?: Date; to?: Date },
  ): Promise<ExpenseRecord[]> {
    const rows = await this.prisma.expense.findMany({
      where: {
        groupId,
        occurredAt: {
          ...(range?.from ? { gte: range.from } : {}),
          ...(range?.to ? { lte: range.to } : {}),
        },
      },
      orderBy: { occurredAt: "desc" },
      select: {
        id: true,
        groupId: true,
        payerId: true,
        amountMinor: true,
        description: true,
        occurredAt: true,
        payer: { select: { name: true } },
        participants: {
          select: { userId: true, shareMinor: true, user: { select: { name: true } } },
        },
        guests: { select: { name: true, shareMinor: true } },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      groupId: r.groupId,
      payerId: r.payerId,
      payerName: r.payer.name,
      amountMinor: r.amountMinor,
      description: r.description,
      occurredAt: r.occurredAt,
      participants: r.participants.map((p) => ({
        userId: p.userId,
        name: p.user.name,
        shareMinor: p.shareMinor,
      })),
      guests: r.guests.map((g) => ({ name: g.name, shareMinor: g.shareMinor })),
    }));
  }

  /** Total each user has *paid* (as expense payer) within a group. */
  async getPaidTotals(groupId: string): Promise<UserTotal[]> {
    const grouped = await this.prisma.expense.groupBy({
      by: ["payerId"],
      where: { groupId },
      _sum: { amountMinor: true },
    });
    return grouped.map((g) => ({
      userId: g.payerId,
      totalMinor: g._sum.amountMinor ?? 0,
    }));
  }

  /** Total share each user *owes* (as an expense participant) within a group. */
  async getShareTotals(groupId: string): Promise<UserTotal[]> {
    const grouped = await this.prisma.expenseParticipant.groupBy({
      by: ["userId"],
      where: { expense: { groupId } },
      _sum: { shareMinor: true },
    });
    return grouped.map((g) => ({
      userId: g.userId,
      totalMinor: g._sum.shareMinor ?? 0,
    }));
  }
}
