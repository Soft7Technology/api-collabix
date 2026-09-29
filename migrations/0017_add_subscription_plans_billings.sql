-- 0015: Add plans and subscription table for the organization plans

-- Create Subscription Plan Table

CREATE TABLE IF NOT EXISTS plans (
    id VARCHAR(20) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,

    price_monthly NUMERIC(10,2) NOT NULL,
    price_yearly NUMERIC(10,2) NOT NULL,

    description TEXT,

    features JSONB NOT NULL DEFAULT '[]'::jsonb,

    razorpay_monthly_plan_id VARCHAR(100),
    razorpay_yearly_plan_id VARCHAR(100),

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create Subscription Table

CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    organization_id UUID NOT NULL
        REFERENCES organizations(id)
        ON DELETE CASCADE,

    plan_id VARCHAR(20) NOT NULL
        REFERENCES plans(id),

    billing_cycle VARCHAR(20) NOT NULL
        CHECK (billing_cycle IN ('monthly', 'yearly')),

    status VARCHAR(30) NOT NULL DEFAULT 'pending'
        CHECK (
            status IN (
                'pending',
                'active',
                'paused',
                'cancelled',
                'expired',
                'failed'
            )
        ),

    razorpay_subscription_id VARCHAR(100) UNIQUE,
    razorpay_customer_id VARCHAR(100),

    current_period_start TIMESTAMP,
    current_period_end TIMESTAMP,

    started_at TIMESTAMP,
    cancelled_at TIMESTAMP,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Prevent Organization from accidently having multiple current sybscription.
CREATE UNIQUE INDEX IF NOT EXISTS one_active_subscription_per_org
ON subscriptions (organization_id)
WHERE status IN ('pending', 'active', 'paused');

-- Add cancel_at_period_end to subscriptions table
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE;

-- Seed Plans
INSERT INTO plans (
    id,
    name,
    price_monthly,
    price_yearly,
    description,
    features,
    razorpay_monthly_plan_id,
    razorpay_yearly_plan_id,
    is_active
)
VALUES
(
    'basic',
    'Basic Plan',
    200.00,
    2000.00,
    'For small teams getting started with essential task tracking.',
    '["Up to 5 team members", "Up to 3 projects", "Unlimited tasks", "Kanban Board", "Basic task management"]',
    'plan_TZpfEF30Kz4n8A',
    'plan_TZpl9XrMzD0Vqq',
    TRUE
),
(
    'pro',
    'Pro Plan',
    450.00,
    4500.00,
    'For growing teams with advanced management features.',
    '["Up to 50 team members", "Unlimited projects", "Screenshot monitoring", "Time tracking", "Departments", "Team Leads", "Attendance", "Advanced Reports & Analytics", "5 GB file storage"]',
    'plan_TZpmzY3I4pDAY3',
    'plan_TZppkcc8r6LakU',
    TRUE
),
(
    'enterprise',
    'Enterprise Plan',
    330.00,
    3300.00,
    'For large organizations requiring custom controls & scale.',
    '["Unlimited team members", "Unlimited projects", "White Label", "Custom Domain", "API Access", "Priority Support", "Advanced Reports", "Custom Integrations", "Unlimited storage"]',
    'plan_TZprsOGnRtVLqc',
    'plan_TZptqeodi9woKc',
    TRUE
)
ON CONFLICT (id) DO NOTHING;