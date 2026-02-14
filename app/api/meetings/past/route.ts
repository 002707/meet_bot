import { prisma } from "@/lib/db";
import { ensureUser } from "@/lib/ensure-user";
import { NextResponse } from "next/server";

export async function GET() {
    try {
        const user = await ensureUser()
        if (!user) {
            return NextResponse.json({ error: "not authed" }, { status: 401 })
        }

        const pastMeetings = await prisma.meeting.findMany({
            where: {
                userId: user.id,
                meetingEnded: true
            },
            orderBy: {
                endTime: 'desc'
            },
            take: 10
        })

        return NextResponse.json({ meetings: pastMeetings })

    } catch (error) {
        console.error('[/api/meetings/past] Error:', error)
        return NextResponse.json({ error: 'failed to fetch past meetings', meetings: [] }, { status: 500 })
    }
}