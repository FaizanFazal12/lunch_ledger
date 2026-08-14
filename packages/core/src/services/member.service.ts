import type { Extraction } from "@lunchledger/shared";
import type { GroupMember, GroupRepository, UserRepository } from "@lunchledger/db";
import { DomainError } from "../errors.js";

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
  const match = members.find((m) => sameName(m.name, name));
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

/** People are addressed by name here, so comparison ignores case and padding. */
function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
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

  /**
   * Add someone to a group as a permanent member.
   *
   * The same person is often in several groups ("Office Friends" and "Cricket Team"),
   * so an existing user with that name is reused rather than duplicated; a brand-new
   * user is created only when nobody by that name exists yet. Adding a name that is
   * already in the group is a no-op the caller should hear about, not a silent dupe.
   */
  async addPermanentMember(groupId: string, name: string): Promise<{ userId: string }> {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new DomainError("VALIDATION", "Who should I add?");
    }

    const members = await this.groups.listMembers(groupId);
    const alreadyIn = members.find((m) => sameName(m.name, trimmed));
    if (alreadyIn !== undefined) {
      throw new DomainError("VALIDATION", `${alreadyIn.name} is already in this group.`);
    }

    const existing = await this.users.findByName(trimmed);
    const user = existing ?? (await this.users.create(trimmed));
    await this.groups.addMember(groupId, user.id);
    return { userId: user.id };
  }

  async removeMember(groupId: string, userId: string): Promise<void> {
    await this.groups.removeMember(groupId, userId);
  }
}
