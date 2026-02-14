import { prisma } from "@/lib/db"
import { ensureUser } from "@/lib/ensure-user"
import { NextResponse } from "next/server"

export async function POST() {
    try {
        const user = await ensureUser()
        if (!user) {
            return NextResponse.json({ error: "not authed" }, { status: 401 })
        }

        if (!user.calendarConnected || !user.googleAccessToken) {
            return NextResponse.json({ error: "calendar not connected" }, { status: 400 })
        }

        let accessToken = user.googleAccessToken

        // Refresh token if expired
        const now = new Date()
        const tokenExpiry = user.googleTokenExpiry ? new Date(user.googleTokenExpiry) : new Date(0)
        const tenMinutesFromNow = new Date(now.getTime() + 10 * 60 * 1000)

        if (tokenExpiry <= tenMinutesFromNow) {
            accessToken = await refreshGoogleToken(user)
            if (!accessToken) {
                return NextResponse.json({ error: "failed to refresh token" }, { status: 401 })
            }
        }

        // Fetch events from Google Calendar
        const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
        const response = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
            `timeMin=${now.toISOString()}&` +
            `timeMax=${sevenDays.toISOString()}&` +
            `singleEvents=true&orderBy=startTime&showDeleted=true`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        )

        if (!response.ok) {
            if (response.status === 401) {
                await prisma.user.update({
                    where: { id: user.id },
                    data: { calendarConnected: false }
                })
                return NextResponse.json({ error: "calendar auth expired, please reconnect" }, { status: 401 })
            }
            throw new Error(`Calendar API failed: ${response.status}`)
        }

        const data = await response.json()
        const events = data.items || []

        // Get existing meetings from DB
        const existingEvents = await prisma.meeting.findMany({
            where: {
                userId: user.id,
                isFromCalendar: true,
                startTime: { gte: now }
            }
        })

        // Log events for debugging
        for (const event of events) {
            console.log(`[sync-calendar] Event: "${event.summary}" | meetingUrl: ${event.hangoutLink || event.conferenceData?.entryPoints?.[0]?.uri || 'NONE'} | start: ${event.start?.dateTime || event.start?.date || 'NONE'}`)
        }

        const googleEventIds = new Set<string>()
        let synced = 0
        let deleted = 0

        for (const event of events) {
            if (event.status === 'cancelled') {
                const existing = await prisma.meeting.findUnique({
                    where: { calendarEventId: event.id }
                })
                if (existing) {
                    await prisma.meeting.delete({ where: { calendarEventId: event.id } })
                    deleted++
                }
                continue
            }
            googleEventIds.add(event.id)
            const didSync = await processEvent(user, event)
            if (didSync) synced++
        }

        // Remove meetings that no longer exist in Google Calendar
        const deletedEvents = existingEvents.filter(
            dbEvent => !googleEventIds.has(dbEvent.calendarEventId!)
        )
        for (const deletedEvent of deletedEvents) {
            await prisma.meeting.delete({ where: { id: deletedEvent.id } })
            deleted++
        }

        console.log(`[sync-calendar] Synced ${synced} events, deleted ${deleted} for user ${user.id}`)
        return NextResponse.json({
            message: "calendar synced",
            synced,
            deleted,
            totalEvents: events.length
        })
    } catch (error) {
        console.error('[sync-calendar] Error:', error)
        return NextResponse.json({ error: "sync failed" }, { status: 500 })
    }
}

async function refreshGoogleToken(user: any) {
    if (!user.googleRefreshToken) {
        await prisma.user.update({
            where: { id: user.id },
            data: { calendarConnected: false, googleAccessToken: null }
        })
        return null
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            refresh_token: user.googleRefreshToken,
            grant_type: 'refresh_token'
        })
    })

    const tokens = await response.json()
    if (!tokens.access_token) {
        await prisma.user.update({
            where: { id: user.id },
            data: { calendarConnected: false }
        })
        return null
    }

    await prisma.user.update({
        where: { id: user.id },
        data: {
            googleAccessToken: tokens.access_token,
            googleTokenExpiry: new Date(Date.now() + (tokens.expires_in * 1000))
        }
    })
    return tokens.access_token
}

async function processEvent(user: any, event: any) {
    const meetingUrl = event.hangoutLink || event.conferenceData?.entryPoints?.[0]?.uri
    if (!meetingUrl || !event.start?.dateTime) {
        return false
    }

    const eventData = {
        calendarEventId: event.id,
        userId: user.id,
        title: event.summary || 'Untitled Meeting',
        description: event.description || null,
        meetingUrl: meetingUrl,
        startTime: new Date(event.start.dateTime),
        endTime: new Date(event.end.dateTime),
        attendees: event.attendees ? JSON.stringify(event.attendees.map((a: any) => a.email)) : null,
        isFromCalendar: true,
        botScheduled: true
    }

    const existing = await prisma.meeting.findUnique({
        where: { calendarEventId: event.id }
    })

    if (existing) {
        const updateData: any = {
            title: eventData.title,
            description: eventData.description,
            meetingUrl: eventData.meetingUrl,
            startTime: eventData.startTime,
            endTime: eventData.endTime,
            attendees: eventData.attendees
        }
        if (!existing.botSent) {
            updateData.botScheduled = eventData.botScheduled
        }
        await prisma.meeting.update({
            where: { calendarEventId: event.id },
            data: updateData
        })
    } else {
        await prisma.meeting.create({ data: eventData })
    }
    return true
}
