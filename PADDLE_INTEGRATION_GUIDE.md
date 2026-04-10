# Paddle Payment Integration Guide

## Overview
This guide covers implementing Paddle payment system for ClinicalPSM's subscription tiers (Free, Plus, Pro).

## Prerequisites

### Required Accounts & Services
1. **Paddle Account**
   - Sign up at [paddle.com](https://paddle.com)
   - Get your Seller ID and API keys
   - Configure your business details and pricing

2. **Environment Variables**
   ```bash
   # Production
   PADDLE_SELLER_ID=your_seller_id
   PADDLE_API_KEY=your_api_key
   PADDLE_WEBHOOK_SECRET=your_webhook_secret
   
   # Sandbox (for testing)
   PADDLE_ENVIRONMENT=sandbox
   PADDLE_SANDBOX_SELLER_ID=your_sandbox_seller_id
   PADDLE_SANDBOX_API_KEY=your_sandbox_api_key
   ```

### Technical Requirements
- Node.js 18+ for Paddle SDK
- HTTPS for production webhook endpoints
- Database schema updates for subscription management

## Implementation Steps

### 1. Install Paddle Dependencies
```bash
npm install @paddle/paddle-node-sdk
# or
yarn add @paddle/paddle-node-sdk
```

### 2. Database Schema Updates

```sql
-- Migration: 007_add_subscriptions.sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(user_id),
  paddle_subscription_id TEXT UNIQUE NOT NULL,
  paddle_customer_id TEXT NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('plus', 'pro')),
  status TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'past_due', 'paused')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_url TEXT,
  update_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Update profiles table to reference subscription
ALTER TABLE profiles ADD COLUMN subscription_id UUID REFERENCES subscriptions(id);

-- Indexes for performance
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_paddle_id ON subscriptions(paddle_subscription_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
```

### 3. Paddle Client Setup

```typescript
// src/lib/paddle.ts
import { Paddle } from '@paddle/paddle-node-sdk'

let paddle: Paddle

export async function getPaddleClient(): Promise<Paddle> {
  if (!paddle) {
    paddle = new Paddle({
      environment: process.env.PADDLE_ENVIRONMENT === 'sandbox' ? 'sandbox' : 'production',
      sellerId: parseInt(process.env.PADDLE_SELLER_ID!),
      apiKey: process.env.PADDLE_API_KEY!,
    })
  }
  return paddle
}

export async function createPaddleCustomer(email: string, userId: string) {
  const paddle = await getPaddleClient()
  
  return await paddle.customers.create({
    email,
    customData: {
      userId,
    },
  })
}

export async function createSubscription(priceId: string, customerId: string) {
  const paddle = await getPaddleClient()
  
  return await paddle.subscriptions.create({
    items: [
      {
        priceId,
        quantity: 1,
      },
    ],
    customer: {
      id: customerId,
    },
  })
}
```

### 4. Update User Profiles

```typescript
// src/lib/subscription.ts
import { createClient } from './supabase/server'
import { getPaddleClient } from './paddle'

export interface SubscriptionPlan {
  id: string
  name: string
  paddlePriceId: string
  features: string[]
  price: {
    monthly: number
    yearly: number
  }
}

export const SUBSCRIPTION_PLANS: Record<string, SubscriptionPlan> = {
  plus: {
    id: 'plus',
    name: 'Plus',
    paddlePriceId: 'pri_01hj45kz0x7z7m7', // Your Paddle price ID
    features: [
      'Up to 5,000 rows per analysis',
      'Advanced matching algorithms',
      'Priority support',
      'Export to Excel',
    ],
    price: {
      monthly: 29,
      yearly: 290,
    },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    paddlePriceId: 'pri_01hj45kz0x7z7m8', // Your Paddle price ID
    features: [
      'Unlimited rows per analysis',
      'All Plus features',
      'API access',
      'Custom integrations',
      'Dedicated support',
    ],
    price: {
      monthly: 99,
      yearly: 990,
    },
  },
}

export async function updateUserSubscription(
  userId: string,
  subscriptionData: any
) {
  const supabase = await createClient()
  
  // Update or create subscription record
  const { data: subscription } = await supabase
    .from('subscriptions')
    .upsert({
      user_id: userId,
      paddle_subscription_id: subscriptionData.id,
      paddle_customer_id: subscriptionData.customerId,
      plan: subscriptionData.planId,
      status: subscriptionData.status,
      current_period_start: subscriptionData.currentPeriodStart,
      current_period_end: subscriptionData.currentPeriodEnd,
      cancel_url: subscriptionData.cancelUrl,
      update_url: subscriptionData.updateUrl,
    })
    .select()
    .single()

  // Update user profile
  await supabase
    .from('profiles')
    .update({
      plan: subscriptionData.planId,
      subscription_id: subscription.id,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)

  return subscription
}
```

### 5. Webhook Handler

```typescript
// src/app/api/paddle/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getPaddleClient } from '@/lib/paddle'
import { updateUserSubscription } from '@/lib/subscription'
import { auditLog } from '@/lib/audit'

export async function POST(request: NextRequest) {
  const signature = request.headers.get('paddle-signature')
  const body = await request.text()
  
  // Verify webhook signature
  const paddle = await getPaddleClient()
  const isValid = await paddle.webhooks.unmarshal(body, signature, {
    secretKey: process.env.PADDLE_WEBHOOK_SECRET!,
  })
  
  if (!isValid) {
    await auditLog.securityEvent(
      'webhook_signature_invalid',
      { signature: signature?.slice(0, 10) + '...' },
      request
    )
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }
  
  try {
    const event = JSON.parse(body)
    
    switch (event.type) {
      case 'subscription.created':
      case 'subscription.updated':
        await handleSubscriptionChange(event.data)
        break
        
      case 'subscription.canceled':
        await handleSubscriptionCancellation(event.data)
        break
        
      case 'payment.succeeded':
        await handlePaymentSuccess(event.data)
        break
        
      case 'payment.failed':
        await handlePaymentFailure(event.data)
        break
    }
    
    return NextResponse.json({ received: true })
  } catch (error) {
    await auditLog.errorOccurred(
      error instanceof Error ? error : new Error('Webhook processing error'),
      { eventType: event.type },
      request
    )
    return NextResponse.json({ error: 'Processing error' }, { status: 500 })
  }
}

async function handleSubscriptionChange(subscriptionData: any) {
  const userId = subscriptionData.customData?.userId
  if (!userId) return
  
  await updateUserSubscription(userId, {
    id: subscriptionData.id,
    customerId: subscriptionData.customerId,
    planId: subscriptionData.items[0].price.id.includes('plus') ? 'plus' : 'pro',
    status: subscriptionData.status,
    currentPeriodStart: subscriptionData.currentPeriodStart,
    currentPeriodEnd: subscriptionData.currentPeriodEnd,
    cancelUrl: subscriptionData.cancelUrl,
    updateUrl: subscriptionData.updateUrl,
  })
  
  await auditLog.subscriptionUpdated(userId, subscriptionData.id, {
    plan: subscriptionData.items[0].price.id.includes('plus') ? 'plus' : 'pro',
    status: subscriptionData.status,
  })
}
```

### 6. Update Pricing Page

```typescript
// src/app/pricing/page.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createCheckoutSession } from '@/lib/subscription'

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null)
  
  const handleSubscribe = async (planId: 'plus' | 'pro', billingCycle: 'monthly' | 'yearly') => {
    setLoading(`${planId}-${billingCycle}`)
    
    try {
      const checkoutUrl = await createCheckoutSession(planId, billingCycle)
      window.location.href = checkoutUrl
    } catch (error) {
      console.error('Subscription error:', error)
      // Show error toast
    } finally {
      setLoading(null)
    }
  }
  
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold text-center mb-8">Choose Your Plan</h1>
      
      <div className="grid md:grid-cols-3 gap-6">
        {/* Free Plan */}
        <Card>
          <CardHeader>
            <CardTitle>Free</CardTitle>
            <CardDescription>Perfect for getting started</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="text-3xl font-bold">$0<span className="text-lg text-muted-foreground">/month</span></div>
              <ul className="space-y-2">
                <li>✓ Up to 500 rows per analysis</li>
                <li>✓ Basic matching algorithms</li>
                <li>✓ CSV export</li>
              </ul>
              <Button className="w-full" variant="outline" disabled>
                Current Plan
              </Button>
            </div>
          </CardContent>
        </Card>
        
        {/* Plus Plan */}
        <Card className="border-primary">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Plus</CardTitle>
              <Badge>Popular</Badge>
            </div>
            <CardDescription>For serious researchers</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="text-3xl font-bold">$29<span className="text-lg text-muted-foreground">/month</span></div>
              <ul className="space-y-2">
                <li>✓ Up to 5,000 rows per analysis</li>
                <li>✓ Advanced matching algorithms</li>
                <li>✓ Priority support</li>
                <li>✓ Export to Excel</li>
              </ul>
              <div className="space-y-2">
                <Button 
                  className="w-full" 
                  onClick={() => handleSubscribe('plus', 'monthly')}
                  disabled={loading === 'plus-monthly'}
                >
                  {loading === 'plus-monthly' ? 'Loading...' : 'Subscribe Monthly'}
                </Button>
                <Button 
                  className="w-full" 
                  variant="outline"
                  onClick={() => handleSubscribe('plus', 'yearly')}
                  disabled={loading === 'plus-yearly'}
                >
                  {loading === 'plus-yearly' ? 'Loading...' : 'Subscribe Yearly (Save 17%)'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Pro Plan */}
        <Card className="border-primary">
          <CardHeader>
            <CardTitle>Pro</CardTitle>
            <CardDescription>For power users and teams</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="text-3xl font-bold">$99<span className="text-lg text-muted-foreground">/month</span></div>
              <ul className="space-y-2">
                <li>✓ Unlimited rows per analysis</li>
                <li>✓ All Plus features</li>
                <li>✓ API access</li>
                <li>✓ Custom integrations</li>
                <li>✓ Dedicated support</li>
              </ul>
              <div className="space-y-2">
                <Button 
                  className="w-full" 
                  onClick={() => handleSubscribe('pro', 'monthly')}
                  disabled={loading === 'pro-monthly'}
                >
                  {loading === 'pro-monthly' ? 'Loading...' : 'Subscribe Monthly'}
                </Button>
                <Button 
                  className="w-full" 
                  variant="outline"
                  onClick={() => handleSubscribe('pro', 'yearly')}
                  disabled={loading === 'pro-yearly'}
                >
                  {loading === 'pro-yearly' ? 'Loading...' : 'Subscribe Yearly (Save 17%)'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

### 7. Checkout Session Creation

```typescript
// src/lib/subscription.ts
import { getPaddleClient } from './paddle'
import { createClient } from './supabase/server'
import { SUBSCRIPTION_PLANS } from './subscription'

export async function createCheckoutSession(
  planId: 'plus' | 'pro',
  billingCycle: 'monthly' | 'yearly'
): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error('User not authenticated')
  }
  
  const plan = SUBSCRIPTION_PLANS[planId]
  const priceId = billingCycle === 'yearly' 
    ? plan.paddlePriceId.replace('monthly', 'yearly')
    : plan.paddlePriceId
  
  // Create or get Paddle customer
  let paddleCustomerId = user.user_metadata?.paddle_customer_id
  
  if (!paddleCustomerId) {
    const customer = await createPaddleCustomer(user.email!, user.id)
    paddleCustomerId = customer.id
    
    // Save customer ID to user metadata
    await supabase.auth.updateUser({
      data: { paddle_customer_id: customer.id }
    })
  }
  
  // Create checkout session
  const paddle = await getPaddleClient()
  const checkout = await paddle.checkout.create({
    items: [
      {
        priceId,
        quantity: 1,
      },
    ],
    customer: {
      id: paddleCustomerId,
    },
    customData: {
      userId: user.id,
      planId,
      billingCycle,
    },
  })
  
  return checkout.url
}
```

## Security Considerations

### 1. Webhook Security
- Always verify webhook signatures using Paddle's secret
- Use HTTPS for webhook endpoints
- Implement idempotency for webhook processing
- Log all webhook events for audit trails

### 2. Data Protection
- Encrypt sensitive customer data
- Implement proper access controls for subscription data
- Follow GDPR/CCPA compliance for customer information
- Regular security audits of payment processing

### 3. Rate Limiting
- Rate limit checkout creation attempts
- Implement CAPTCHA for suspicious activity
- Monitor for unusual subscription patterns

## Testing Checklist

### 1. Sandbox Testing
- [ ] Test all subscription flows in Paddle sandbox
- [ ] Verify webhook events are received correctly
- [ ] Test subscription upgrades/downgrades
- [ ] Test cancellation and reactivation flows
- [ ] Verify plan limits are enforced correctly

### 2. Production Readiness
- [ ] All environment variables configured
- [ ] Webhook endpoint accessible via HTTPS
- [ ] Database migrations applied
- [ ] Error monitoring and logging in place
- [ ] Customer support processes documented

## Deployment Steps

### 1. Environment Setup
```bash
# Add to .env.local
PADDLE_SELLER_ID=your_production_seller_id
PADDLE_API_KEY=your_production_api_key
PADDLE_WEBHOOK_SECRET=your_webhook_secret
PADDLE_ENVIRONMENT=production
```

### 2. Database Migration
```bash
# Apply the subscription schema migration
supabase db push
```

### 3. Deploy Changes
```bash
# Deploy your application
git add .
git commit -m "feat: Add Paddle payment integration"
git push origin main
```

## Post-Implementation

### 1. Monitoring
- Monitor webhook processing success rates
- Track subscription conversion rates
- Monitor payment failure rates
- Set up alerts for unusual activity

### 2. Customer Support
- Document subscription management processes
- Create support templates for common issues
- Set up customer dashboard for self-service
- Implement refund and dispute handling

### 3. Compliance
- Ensure tax calculation compliance
- Implement proper invoice generation
- Set up data retention policies
- Regular security audits

## Troubleshooting

### Common Issues
1. **Webhook Not Received**
   - Check Paddle webhook configuration
   - Verify webhook URL is accessible
   - Check signature verification logic

2. **Subscription Not Activated**
   - Verify customer creation process
   - Check webhook event processing
   - Ensure database updates are successful

3. **Plan Limits Not Applied**
   - Verify subscription status checks
   - Check plan enforcement logic
   - Ensure proper user plan updates

## Resources

- [Paddle Documentation](https://www.paddle.com/docs)
- [Paddle Node.js SDK](https://github.com/paddle/paddle-node-sdk)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Next.js API Routes](https://nextjs.org/docs/api-routes/introduction)

---

**Note**: This guide assumes you have a working ClinicalPSM application with the existing authentication and database systems already in place.
