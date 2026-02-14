import { prisma } from "@/lib/db";
import { auth, currentUser } from "@clerk/nextjs/server";

export async function ensureUser() {
    const { userId } = await auth();

    if (!userId) {
        return null;
    }

    let user = await prisma.user.findUnique({
        where: { clerkId: userId },
    });

    if (!user) {
        const clerkUser = await currentUser();
        const email = clerkUser?.emailAddresses?.[0]?.emailAddress ?? null;
        const name = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") || null;

        user = await prisma.user.upsert({
            where: { clerkId: userId },
            update: {},
            create: {
                id: userId,
                clerkId: userId,
                email,
                name,
            },
        });
    }

    return user;
}
