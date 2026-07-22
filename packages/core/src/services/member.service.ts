import type { Extraction } from "@lunchledger/shared";
import type { GroupMember, GroupRepository, UserRepository } from "@lunchledger/db";

const SELF_ALIASES = new Set(["me", "myself", "i", "self"]);

export interface ResolvedParticipants {
  userIds: string[];
  unknownNames: string[];
}

export interface ResolvedName {
  userId: string | null;
  unknownName: string | null;
}

/**
 * Deterministic mapping of spoken names to concrete member ids within a group.
 * "me"/"myself"/"I" resolve to the current user. Names that match no member are
 * returned as `unknownNames`, which the graph turns into a clarification question.
 */
export function resolveName(
  members: GroupMember[],
  currentUserId: string | null,
  rawName: string,
): ResolvedName {
  const name = rawName.trim().toLowerCase();
  if (SELF_ALIASES.has(name)) {
    return currentUserId !== null
      ? { userId: currentUserId, unknownName: null }
      : { userId: null, unknownName: null };
  }
  const match = members.find((m) => m.name.trim().toLowerCase() === name);
  return match
    ? { userId: match.userId, unknownName: null }
    : { userId: null, unknownName: rawName.trim() };
}

/** Resolve the participant set from an extraction against the group's members. */
export function resolveParticipants(
  members: GroupMember[],
  currentUserId: string | null,
  extraction: Extraction,
): ResolvedParticipants {
  const allIds = members.map((m) => m.userId);
  const unknownNames: string[] = [];

  const resolveList = (raw: string[]): string[] => {
    const ids: string[] = [];
    for (const rawName of raw) {
      const { userId, unknownName } = resolveName(members, currentUserId, rawName);
      if (userId !== null) ids.push(userId);
      else if (unknownName !== null) unknownNames.push(unknownName);
    }
    return ids;
  };

  let userIds: string[];
  switch (extraction.participantMode) {
    case "all":
    case "unspecified": {
      userIds = allIds;
      break;
    }
    case "all_except": {
      const excludedIds = new Set(resolveList(extraction.excluded));
      userIds = allIds.filter((id) => !excludedIds.has(id));
      break;
    }
    case "only": {
      userIds = resolveList(extraction.names);
      break;
    }
  }

  // Any extra names mentioned alongside "all"/"except" modes still count as participants.
  if (extraction.participantMode !== "only") {
    for (const id of resolveList(extraction.names)) {
      if (!userIds.includes(id)) userIds.push(id);
    }
  }

  return { userIds: dedupe(userIds), unknownNames: dedupe(unknownNames) };
}

function dedupe<T>(items: T[]): T[] {
  return [...new Set(items)];
}

/**
 * Membership mutations (add/remove permanent members). Creating brand-new users
 * is allowed so "add Bilal permanently" works end to end.
 */
export class MemberService {
  constructor(
    private readonly groups: GroupRepository,
    private readonly users: UserRepository,
  ) {}

  async addPermanentMember(groupId: string, name: string): Promise<{ userId: string }> {
    const user = await this.users.create(name);
    await this.groups.addMember(groupId, user.id);
    return { userId: user.id };
  }

  async removeMember(groupId: string, userId: string): Promise<void> {
    await this.groups.removeMember(groupId, userId);
  }
}
