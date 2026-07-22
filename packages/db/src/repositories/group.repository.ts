import type { PrismaClient } from "@prisma/client";

export interface GroupMember {
  userId: string;
  name: string;
}

/**
 * Data access for groups and their membership. No business logic lives here.
 */
export class GroupRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(name: string): Promise<{ id: string; name: string }> {
    return this.prisma.group.create({ data: { name }, select: { id: true, name: true } });
  }

  async findById(groupId: string): Promise<{ id: string; name: string } | null> {
    return this.prisma.group.findUnique({
      where: { id: groupId },
      select: { id: true, name: true },
    });
  }

  /** All permanent members of a group. */
  async listMembers(groupId: string): Promise<GroupMember[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { groupId },
      select: { userId: true, user: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
    return memberships.map((m) => ({ userId: m.userId, name: m.user.name }));
  }

  async addMember(groupId: string, userId: string): Promise<void> {
    await this.prisma.membership.upsert({
      where: { groupId_userId: { groupId, userId } },
      create: { groupId, userId },
      update: {},
    });
  }

  async removeMember(groupId: string, userId: string): Promise<void> {
    await this.prisma.membership.deleteMany({ where: { groupId, userId } });
  }
}
