import type { GroupRepository } from "@lunchledger/db";
import { DomainError } from "../errors.js";

/** Group lifecycle. */
export class GroupService {
  constructor(private readonly groups: GroupRepository) {}

  async createGroup(name: string): Promise<{ groupId: string; name: string }> {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new DomainError("VALIDATION", "A group needs a name.");
    }
    const group = await this.groups.create(trimmed);
    return { groupId: group.id, name: group.name };
  }
}
