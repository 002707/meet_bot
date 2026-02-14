import { ensureUser } from "@/lib/ensure-user";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
    try {
        const user = await ensureUser()

        if (!user) {
            return NextResponse.json({ error: 'not authed' }, { status: 401 })
        }

        return NextResponse.json({
            currentPlan: user.currentPlan,
            subscriptionStatus: user.subscriptionStatus,
            meetingsThisMonth: user.meetingsThisMonth,
            chatMessagesToday: user.chatMessagesToday,
            billingPeriodStart: user.billingPeriodStart,
        })
    } catch (error) {
        console.error('[/api/user/usage] Error:', error)
        return NextResponse.json({ error: 'failed to fetch usage' }, { status: 500 })
    }
}
