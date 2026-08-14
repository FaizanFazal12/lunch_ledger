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

  /**
   * The earliest-created user with this name, case-insensitively. Names are how the
   * app addresses people, so this is what "is there already an Ali?" means here.
   */
  async findByName(name: string): Promise<{ id: string; name: string } | null> {
    return this.prisma.user.findFirst({
      where: { name: { equals: name.trim(), mode: "insensitive" } },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    });
  }

  async findById(userId: string): Promise<{ id: string; name: string } | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true },
    });
  }
}
