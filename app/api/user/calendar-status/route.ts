import { ensureUser } from "@/lib/ensure-user";
import { NextResponse } from "next/server";

export async function GET() {
    try {
        const user = await ensureUser()
        if (!user) {
            return NextResponse.json({ connected: false })
        }

        return NextResponse.json({
            connected: user?.calendarConnected && !!user.googleAccessToken
        })
    } catch (error) {
        return NextResponse.json({ connected: false })
    }
}