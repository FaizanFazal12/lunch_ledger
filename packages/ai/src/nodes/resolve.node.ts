import { resolveDate, resolveName, resolveParticipants } from "@lunchledger/core";
import type { GroupMember } from "@lunchledger/core";
import type { Extraction } from "@lunchledger/shared";
import type { AgentDeps } from "./deps.js";
import type { AgentStateType, AgentStateUpdate, ResolvedInput } from "../state/graphState.js";

/**
 * Participant Resolver node (deterministic). Maps spoken names to member ids,
 * resolves "me", parses the date, and decides whether a clarification is needed
 * (unknown names, missing payer/amount). It performs no writes.
 */
export function makeResolveNode(deps: AgentDeps) {
  return async function resolve(state: AgentStateType): Promise<AgentStateUpdate> {
    const extraction = state.extraction;
    if (extraction === null) {
      return { clarification: "Sorry, I didn't catch that. Could you rephrase?" };
    }

    const members = await deps.services.groups.listMembers(state.groupId);
    const occurredAt = resolveDate(extraction.dateText, state.now);

    const empty: ResolvedInput = {
      payerId: null,
      participantUserIds: [],
      guestNames: [],
      settleFromId: null,
      settleToId: null,
      occurredAt,
      unknownNames: [],
    };

    switch (extraction.intent) {
      case "ADD_EXPENSE":
        return resolveAddExpense(extraction, members, state.currentUserId, empty);
      case "SETTLE_PAYMENT":
        return resolveSettlement(extraction, members, state.currentUserId, empty);
      case "REMOVE_MEMBER":
        return resolveRemoveMember(extraction, members, state.currentUserId, empty);
      default:
        // Read-only / group-creation intents need no resolution.
        return { resolved: empty };
    }
  };
}

function resolveAddExpense(
  extraction: Extraction,
  members: GroupMember[],
  currentUserId: string | null,
  resolved: ResolvedInput,
): AgentStateUpdate {
  const unknownNames: string[] = [];

  let payerId: string | null = null;
  if (extraction.payer !== null) {
    const r = resolveName(members, currentUserId, extraction.payer);
    if (r.userId !== null) payerId = r.userId;
    else if (r.unknownName !== null) unknownNames.push(r.unknownName);
  }

  const participants = resolveParticipants(members, currentUserId, extraction);
  unknownNames.push(...participants.unknownNames);

  const next: ResolvedInput = {
    ...resolved,
    payerId,
    participantUserIds: participants.userIds,
    unknownNames,
  };

  const clarification = addExpenseClarification(extraction, next);
  return clarification !== null ? { resolved: next, clarification } : { resolved: next };
}

function addExpenseClarification(extraction: Extraction, r: ResolvedInput): string | null {
  if (r.unknownNames.length > 0) {
    const name = r.unknownNames[0] as string;
    return `${name} is not a member of this group. Would you like to add ${name} temporarily (just this expense) or permanently?`;
  }
  if (extraction.amount === null) {
    return "How much was the expense?";
  }
  if (r.payerId === null) {
    return "Who paid for this?";
  }
  if (r.participantUserIds.length === 0) {
    return "Who took part in this expense?";
  }
  return null;
}

function resolveSettlement(
  extraction: Extraction,
  members: GroupMember[],
  currentUserId: string | null,
  resolved: ResolvedInput,
): AgentStateUpdate {
  const unknownNames: string[] = [];
  const from = extraction.settleFrom !== null
    ? resolveName(members, currentUserId, extraction.settleFrom)
    : null;
  const to = extraction.settleTo !== null
    ? resolveName(members, currentUserId, extraction.settleTo)
    : null;

  if (from?.unknownName) unknownNames.push(from.unknownName);
  if (to?.unknownName) unknownNames.push(to.unknownName);

  const next: ResolvedInput = {
    ...resolved,
    settleFromId: from?.userId ?? null,
    settleToId: to?.userId ?? null,
    unknownNames,
  };

  if (unknownNames.length > 0) {
    return { resolved: next, clarification: `I don't recognise ${unknownNames[0]}.` };
  }
  if (extraction.amount === null) {
    return { resolved: next, clarification: "How much was paid?" };
  }
  if (next.settleFromId === null || next.settleToId === null) {
    return { resolved: next, clarification: "Who paid whom? For example: \"Ahmed paid Ali 500\"." };
  }
  return { resolved: next };
}

function resolveRemoveMember(
  extraction: Extraction,
  members: GroupMember[],
  currentUserId: string | null,
  resolved: ResolvedInput,
): AgentStateUpdate {
  if (extraction.targetName === null) {
    return { resolved, clarification: "Who would you like to remove?" };
  }
  const r = resolveName(members, currentUserId, extraction.targetName);
  if (r.userId === null) {
    return { resolved, clarification: `${extraction.targetName} is not a member of this group.` };
  }
  return { resolved: { ...resolved, payerId: r.userId } };
}
