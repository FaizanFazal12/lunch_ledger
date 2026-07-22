import { toMinorUnits } from "@lunchledger/shared";
import type { SettlementRepository } from "@lunchledger/db";
import { DomainError } from "../errors.js";

export interface CreateSettlementCommand {
  groupId: string;
  fromUserId: string;
  toUserId: string;
  amountMajor: number;
  occurredAt: Date;
}

/** Records a payment from one member to another. Balances recompute automatically. */
export class SettlementService {
  constructor(private readonly settlements: SettlementRepository) {}

  async settle(cmd: CreateSettlementCommand): Promise<{ settlementId: string }> {
    if (!(cmd.amountMajor > 0)) {
      throw new DomainError("VALIDATION", "Settlement amount must be greater than zero.");
    }
    if (cmd.fromUserId === cmd.toUserId) {
      throw new DomainError("VALIDATION", "A member cannot settle with themselves.");
    }
    const { id } = await this.settlements.create({
      groupId: cmd.groupId,
      fromUserId: cmd.fromUserId,
      toUserId: cmd.toUserId,
      amountMinor: toMinorUnits(cmd.amountMajor),
      occurredAt: cmd.occurredAt,
    });
    return { settlementId: id };
  }
}
