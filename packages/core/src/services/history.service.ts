import type { ExpenseView } from "@lunchledger/shared";
import type { ExpenseRepository } from "@lunchledger/db";

export interface HistoryQuery {
  groupId: string;
  from?: Date;
  to?: Date;
}

/** Read-only expense history for a group and optional date range. */
export class HistoryService {
  constructor(private readonly expenses: ExpenseRepository) {}

  async getHistory(query: HistoryQuery): Promise<ExpenseView[]> {
    const range: { from?: Date; to?: Date } = {};
    if (query.from !== undefined) range.from = query.from;
    if (query.to !== undefined) range.to = query.to;

    const records = await this.expenses.listByGroup(query.groupId, range);
    return records.map((r) => ({
      id: r.id,
      payerName: r.payerName,
      amountMinor: r.amountMinor,
      description: r.description,
      occurredAt: r.occurredAt.toISOString(),
      participants: [
        ...r.participants.map((p) => ({
          name: p.name,
          isGuest: false,
          shareMinor: p.shareMinor,
        })),
        ...r.guests.map((g) => ({
          name: g.name,
          isGuest: true,
          shareMinor: g.shareMinor,
        })),
      ],
    }));
  }
}
