import { DomainError, isDomainError } from "@lunchledger/core";
import type { GroupMember } from "@lunchledger/core";
import type { AgentDeps } from "./deps.js";
import type { AgentStateType, AgentStateUpdate, ResolvedInput } from "../state/graphState.js";
import type { ExecResult } from "./results.js";

/**
 * Tool Executor node. Deterministically dispatches the resolved intent to the Tool
 * Layer. All money/DB work happens behind the tools; this node only orchestrates.
 * DomainErrors are turned into user-facing clarifications rather than crashes.
 */
export function makeExecuteNode(deps: AgentDeps) {
  return async function execute(state: AgentStateType): Promise<AgentStateUpdate> {
    const { extraction, resolved } = state;
    if (extraction === null || resolved === null) {
      return { clarification: "Sorry, I couldn't process that. Could you rephrase?" };
    }

    try {
      const members = await deps.services.groups.listMembers(state.groupId);
      const nameOf = makeNameLookup(members);
      const data = await dispatch(deps, state, extraction, resolved, nameOf);
      return { data };
    } catch (err: unknown) {
      if (isDomainError(err)) {
        return { clarification: err.message };
      }
      throw err;
    }
  };
}

async function dispatch(
  deps: AgentDeps,
  state: AgentStateType,
  extraction: NonNullable<AgentStateType["extraction"]>,
  resolved: ResolvedInput,
  nameOf: (userId: string) => string,
): Promise<ExecResult> {
  switch (extraction.intent) {
    case "ADD_EXPENSE": {
      if (resolved.payerId === null || extraction.amount === null) {
        throw new DomainError("VALIDATION", "Missing payer or amount.");
      }
      const result = await deps.tools.createExpense({
        groupId: state.groupId,
        payerId: resolved.payerId,
        participantUserIds: resolved.participantUserIds,
        guestNames: resolved.guestNames,
        amountMajor: extraction.amount,
        description: extraction.description,
        occurredAt: resolved.occurredAt,
      });
      const shareValues = new Set(result.participants.map((p) => p.shareMinor));
      const firstShare = result.participants[0]?.shareMinor ?? null;
      return {
        kind: "expense_added",
        amountMinor: result.amountMinor,
        payerName: nameOf(resolved.payerId),
        participantNames: result.participants.map((p) => nameOf(p.userId)),
        guestNames: result.guests.map((g) => g.name),
        shareMinorEach: shareValues.size === 1 ? firstShare : null,
      };
    }

    case "SHOW_BALANCE": {
      const balances = await deps.tools.getBalances({ groupId: state.groupId });
      return { kind: "balances", balances };
    }

    case "WHO_SHOULD_PAY": {
      const balances = await deps.tools.getBalances({ groupId: state.groupId });
      // The member currently owing the most (most negative) should pay next.
      const sorted = [...balances.balances].sort((a, b) => a.balanceMinor - b.balanceMinor);
      const pick = sorted[0];
      if (pick === undefined) return { kind: "noop" };
      return { kind: "who_should_pay", name: pick.name, balanceMinor: pick.balanceMinor };
    }

    case "SHOW_HISTORY": {
      const expenses = await deps.tools.getHistory({ groupId: state.groupId });
      return { kind: "history", expenses };
    }

    case "SETTLE_PAYMENT": {
      if (resolved.settleFromId === null || resolved.settleToId === null || extraction.amount === null) {
        throw new DomainError("VALIDATION", "Missing settlement details.");
      }
      await deps.tools.createSettlement({
        groupId: state.groupId,
        fromUserId: resolved.settleFromId,
        toUserId: resolved.settleToId,
        amountMajor: extraction.amount,
        occurredAt: resolved.occurredAt,
      });
      return {
        kind: "settled",
        fromName: nameOf(resolved.settleFromId),
        toName: nameOf(resolved.settleToId),
        amountMinor: Math.round(extraction.amount * 100),
      };
    }

    case "CREATE_GROUP": {
      if (extraction.targetName === null) {
        throw new DomainError("VALIDATION", "What should the group be called?");
      }
      const group = await deps.tools.createGroup({ name: extraction.targetName });
      return { kind: "group_created", name: group.name };
    }

    case "ADD_MEMBER": {
      if (extraction.targetName === null) {
        throw new DomainError("VALIDATION", "Who should I add?");
      }
      await deps.tools.addMember({ groupId: state.groupId, name: extraction.targetName });
      return { kind: "member_added", name: extraction.targetName };
    }

    case "REMOVE_MEMBER": {
      // resolve.node stores the target member id in `payerId` for this intent.
      if (resolved.payerId === null) {
        throw new DomainError("VALIDATION", "Who should I remove?");
      }
      const name = nameOf(resolved.payerId);
      await deps.tools.removeMember({ groupId: state.groupId, userId: resolved.payerId });
      return { kind: "member_removed", name };
    }

    default:
      return { kind: "noop" };
  }
}

function makeNameLookup(members: GroupMember[]): (userId: string) => string {
  const map = new Map(members.map((m) => [m.userId, m.name]));
  return (userId: string) => map.get(userId) ?? "someone";
}
