import type { PrismaClient } from "@prisma/client";

/**
 * Data access for users. Business logic (resolving "me", creating guests) lives in core.
 */
export class UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(name: string, email?: string): Promise<{ id: string; name: string }> {
    return this.prisma.user.create({
      data: email === undefined ? { name } : { name, email },
      select: { id: true, name: true },
    });
  }

  async findById(userId: string): Promise<{ id: string; name: string } | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true },
    });
  }
}
