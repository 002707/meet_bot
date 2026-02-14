import { prisma } from '@/lib/db'
import { ensureUser } from '@/lib/ensure-user'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-06-30.basil' })
    : null

export async function POST(request: NextRequest) {
    try {
        if (!stripe) {
            return NextResponse.json({ error: 'Stripe is not configured' }, { status: 503 })
        }

        const dbUser = await ensureUser()

        if (!dbUser) {
            return NextResponse.json({ error: 'not authenticated' }, { status: 401 })
        }

        const { priceId, planName } = await request.json()

        if (!priceId) {
            return NextResponse.json({ error: 'price Id is required' }, { status: 400 })
        }

        let stripeCustomerId = dbUser?.stripeCustomerId

        if (!stripeCustomerId) {
            const customer = await stripe.customers.create({
                email: dbUser.email!,
                name: dbUser.name || undefined,
                metadata: {
                    clerkUserId: dbUser.clerkId,
                    dbUserId: dbUser.id
                }
            })

            stripeCustomerId = customer.id

            await prisma.user.update({
                where: {
                    id: dbUser.id
                },
                data: {
                    stripeCustomerId
                }
            })
        }

        const session = await stripe.checkout.sessions.create({
            customer: stripeCustomerId,
            payment_method_types: ['card'],
            line_items: [
                {
                    price: priceId,
                    quantity: 1
                }
            ],
            mode: 'subscription',
            success_url: `${process.env.NEXT_PUBLIC_APP_URL}/home?success=true`,
            cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`,
            metadata: {
                clerkUserId: dbUser.clerkId,
                dbUserId: dbUser.id,
                planName
            },
            subscription_data: {
                metadata: {
                    clerkUserId: dbUser.clerkId,
                    dbUserId: dbUser.id,
                    planName
                }
            }
        })
        return NextResponse.json({ url: session.url })
    } catch (error) {
        console.error('stripe checkout error:', error)
        return NextResponse.json({ error: 'failed to create checkout session' }, { status: 500 })
    }
}