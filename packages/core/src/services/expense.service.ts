import { splitEqually, toMinorUnits } from "@lunchledger/shared";
import type { ExpenseRepository } from "@lunchledger/db";
import { DomainError } from "../errors.js";

export interface CreateExpenseCommand {
  groupId: string;
  payerId: string;
  /** Amount in whole currency units, as spoken by the user (e.g. 2500). */
  amountMajor: number;
  /** Resolved member ids who share the expense. */
  participantUserIds: string[];
  /** Guest names who share this one expense (they owe their share to the payer). */
  guestNames: string[];
  description: string | null;
  occurredAt: Date;
}

export interface CreateExpenseResult {
  expenseId: string;
  amountMinor: number;
  participants: { userId: string; shareMinor: number }[];
  guests: { name: string; shareMinor: number }[];
}

/**
 * Deterministic expense creation. Given already-resolved participants, it computes
 * the equal split (remainder distributed to the earliest shares) and persists it.
 * No AI, no floating point.
 */
export class ExpenseService {
  constructor(private readonly expenses: ExpenseRepository) {}

  async createExpense(cmd: CreateExpenseCommand): Promise<CreateExpenseResult> {
    if (!(cmd.amountMajor > 0)) {
      throw new DomainError("VALIDATION", "Amount must be greater than zero.");
    }

    const totalShares = cmd.participantUserIds.length + cmd.guestNames.length;
    if (totalShares < 1) {
      throw new DomainError(
        "VALIDATION",
        "An expense needs at least one participant.",
      );
    }

    const amountMinor = toMinorUnits(cmd.amountMajor);
    const shares = splitEqually(amountMinor, totalShares);

    // Members first (in resolved order), then guests — a stable, deterministic assignment.
    const participants = cmd.participantUserIds.map((userId, i) => ({
      userId,
      shareMinor: shares[i] ?? 0,
    }));
    const guests = cmd.guestNames.map((name, i) => ({
      name,
      shareMinor: shares[cmd.participantUserIds.length + i] ?? 0,
    }));

    const { id } = await this.expenses.create({
      groupId: cmd.groupId,
      payerId: cmd.payerId,
      amountMinor,
      description: cmd.description,
      occurredAt: cmd.occurredAt,
      participants,
      guests,
    });

    return { expenseId: id, amountMinor, participants, guests };
  }
}
