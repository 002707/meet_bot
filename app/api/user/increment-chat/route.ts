import { canUserChat, incrementChatUsage } from "@/lib/usage";
import { ensureUser } from "@/lib/ensure-user";
import { error } from "console";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
    try {
        const user = await ensureUser()
        if (!user) {
            return NextResponse.json({ error: 'Not authed' }, { status: 401 })
        }

        const chatCheck = await canUserChat(user.id)

        if (!chatCheck.allowed) {
            return NextResponse.json({
                error: chatCheck.reason,
                upgradeRequired: true
            }, { status: 403 })
        }

        await incrementChatUsage(user.id)

        return NextResponse.json({ success: true })
    } catch (error) {
        return NextResponse.json({ error: 'failed to incrmeent usage' }, { status: 500 })
    }
}