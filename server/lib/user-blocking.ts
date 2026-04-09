import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { userRelationships, users } from "@shared/schema";

export async function getBlockedUserIds(userId: string): Promise<string[]> {
    const [user] = await db.select({ blockedUsers: users.blockedUsers })
        .from(users)
        .where(eq(users.id, userId));

    return user?.blockedUsers || [];
}

export async function isUserBlocked(blockerId: string, targetUserId: string): Promise<boolean> {
    const blockedUsers = await getBlockedUserIds(blockerId);
    return blockedUsers.includes(targetUserId);
}

export async function isEitherUserBlocked(userAId: string, userBId: string): Promise<boolean> {
    const [aBlocked, bBlocked] = await Promise.all([
        isUserBlocked(userAId, userBId),
        isUserBlocked(userBId, userAId),
    ]);

    return aBlocked || bBlocked;
}

export async function blockUser(blockerId: string, targetUserId: string): Promise<{ alreadyBlocked: boolean }> {
    return db.transaction(async (tx) => {
        const [user] = await tx.select({ blockedUsers: users.blockedUsers })
            .from(users)
            .where(eq(users.id, blockerId))
            .limit(1)
            .for("update");

        const blockedUsers = user?.blockedUsers || [];
        const alreadyBlocked = blockedUsers.includes(targetUserId);

        if (!alreadyBlocked) {
            const newBlockedUsers = [...new Set([...blockedUsers, targetUserId])];
            await tx.update(users)
                .set({ blockedUsers: newBlockedUsers })
                .where(eq(users.id, blockerId));
        }

        // Blocking always revokes follow links in both directions.
        await tx.delete(userRelationships)
            .where(and(
                eq(userRelationships.userId, blockerId),
                eq(userRelationships.targetUserId, targetUserId),
                eq(userRelationships.type, "follow")
            ));

        await tx.delete(userRelationships)
            .where(and(
                eq(userRelationships.userId, blockerId),
                eq(userRelationships.targetUserId, targetUserId),
                eq(userRelationships.type, "friend_request")
            ));

        await tx.delete(userRelationships)
            .where(and(
                eq(userRelationships.userId, targetUserId),
                eq(userRelationships.targetUserId, blockerId),
                eq(userRelationships.type, "follow")
            ));

        await tx.delete(userRelationships)
            .where(and(
                eq(userRelationships.userId, targetUserId),
                eq(userRelationships.targetUserId, blockerId),
                eq(userRelationships.type, "friend_request")
            ));

        return { alreadyBlocked };
    });
}

export async function unblockUser(blockerId: string, targetUserId: string): Promise<void> {
    await db.transaction(async (tx) => {
        const [user] = await tx.select({ blockedUsers: users.blockedUsers })
            .from(users)
            .where(eq(users.id, blockerId))
            .limit(1)
            .for("update");

        const blockedUsers = user?.blockedUsers || [];
        const newBlockedUsers = blockedUsers.filter((id: string) => id !== targetUserId);

        await tx.update(users)
            .set({ blockedUsers: newBlockedUsers })
            .where(eq(users.id, blockerId));
    });
}
