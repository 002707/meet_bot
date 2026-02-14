import { canUserChat, incrementChatUsage, incrementMeetingUsage } from "@/lib/usage";
import { ensureUser } from "@/lib/ensure-user";
import { error } from "console";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
    try {
        const user = await ensureUser()
        if (!user) {
            return NextResponse.json({ error: 'Not authed' }, { status: 401 })
        }

        await incrementMeetingUsage(user.id)

        return NextResponse.json({ success: true })
    } catch (error) {
        return NextResponse.json({ error: 'failed to incrmeent usage' }, { status: 500 })
    }
}