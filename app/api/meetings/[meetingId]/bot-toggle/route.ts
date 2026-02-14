import { prisma } from "@/lib/db";
import { ensureUser } from "@/lib/ensure-user";
import { NextResponse } from "next/server";

export async function POST(
    request: Request,
    { params }: { params: { meetingId: string } }
) {
    try {
        const user = await ensureUser()
        if (!user) {
            return NextResponse.json({ error: "not authed" }, { status: 401 })
        }

        const { meetingId } = await params
        const { botScheduled } = await request.json()

        const meeting = await prisma.meeting.update({
            where: {
                id: meetingId,
                userId: user.id
            },
            data: {
                botScheduled: botScheduled
            }
        })

        return NextResponse.json({
            success: true,
            botScheduled: meeting.botScheduled,
            message: `Bot ${botScheduled ? 'enable' : 'disabled'} for meeting`
        })
    } catch (error) {
        console.error('Bot toogle error:', error)
        return NextResponse.json({
            error: "Failed to update bot status"
        }, { status: 500 })
    }
}