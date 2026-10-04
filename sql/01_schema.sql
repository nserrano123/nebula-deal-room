-- =====================================================================
-- Nebula · Schema
-- Your agent in the meeting you're not invited to.
-- Rule: the model writes words; Postgres decides numbers and facts.
-- Multi-tenant from day one: every company that creates a Nebula is a tenant.
-- =====================================================================

DROP SCHEMA IF EXISTS nebula CASCADE;
CREATE SCHEMA nebula;
SET search_path TO nebula;

-- ---------------------------------------------------------------------
-- Human-readable labels for every coded field
-- ---------------------------------------------------------------------
CREATE TABLE code_label (
    domain  text NOT NULL,
    code    text NOT NULL,
    label   text NOT NULL,
    PRIMARY KEY (domain, code)
);

CREATE FUNCTION fn_label(p_domain text, p_code text)
RETURNS text LANGUAGE sql STABLE SET search_path = nebula, public AS $$
    SELECT coalesce(
        (SELECT label FROM nebula.code_label WHERE domain = p_domain AND code = p_code),
        p_code)
$$;

-- ---------------------------------------------------------------------
-- Tenant: the company that owns the Nebula (Fail Fast is customer zero)
-- ---------------------------------------------------------------------
CREATE TABLE tenant (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code                    text NOT NULL UNIQUE,
    name                    text NOT NULL,
    owner_name              text NOT NULL,                    -- who the agent escalates to
    agent_max_discount_pct  numeric(5,2) NOT NULL DEFAULT 0,  -- discount the agent may grant on its own
    audit_status            char(1) NOT NULL DEFAULT 'A' CHECK (audit_status IN ('A','D')),
    deleted_at              timestamptz
);

-- ---------------------------------------------------------------------
-- Quotable modules
-- ---------------------------------------------------------------------
CREATE TABLE product_module (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             uuid NOT NULL REFERENCES tenant(id),
    code                  text NOT NULL,
    name                  text NOT NULL,
    pricing_mode          char(1) NOT NULL CHECK (pricing_mode IN ('I','E')),  -- I included in license, E per employee
    price_per_unit        numeric(14,2),            -- pricing_mode E only
    currency              char(3),
    min_billable_units    int,
    max_quotable_units    int,                      -- above this, a human negotiates
    base_impl_hours       numeric(8,2) NOT NULL DEFAULT 0,
    audit_status          char(1) NOT NULL DEFAULT 'A' CHECK (audit_status IN ('A','D')),
    deleted_at            timestamptz,
    UNIQUE (tenant_id, code)
);

-- ---------------------------------------------------------------------
-- License plans (one per segment)
-- ---------------------------------------------------------------------
CREATE TABLE price_plan (
    id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                  uuid NOT NULL REFERENCES tenant(id),
    code                       text NOT NULL,
    name                       text NOT NULL,
    price_per_user             numeric(14,2) NOT NULL,
    currency                   char(3) NOT NULL,
    min_billable_users         int NOT NULL DEFAULT 1,
    additional_entity_price    numeric(14,2),        -- flat price per additional legal entity
    additional_entity_pct      numeric(5,2),         -- or % of license per additional entity/project
    impl_hour_rate             numeric(14,2) NOT NULL,
    impl_currency              char(3) NOT NULL,
    impl_hours_per_user        numeric(6,2) NOT NULL DEFAULT 0,
    audit_status               char(1) NOT NULL DEFAULT 'A' CHECK (audit_status IN ('A','D')),
    deleted_at                 timestamptz,
    UNIQUE (tenant_id, code)
);

CREATE TABLE impl_complexity (
    tenant_id   uuid NOT NULL REFERENCES tenant(id),
    code        char(1) NOT NULL CHECK (code IN ('L','M','H')),
    multiplier  numeric(4,2) NOT NULL,
    PRIMARY KEY (tenant_id, code)
);

-- ---------------------------------------------------------------------
-- Product knowledge: the only things the agent may claim
-- ---------------------------------------------------------------------
CREATE TABLE product_fact (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES tenant(id),
    code          text NOT NULL,
    topic         text NOT NULL,
    content       text NOT NULL,
    availability  char(1) NOT NULL CHECK (availability IN ('A','D','N')),  -- available, in development, not available
    audit_status  char(1) NOT NULL DEFAULT 'A' CHECK (audit_status IN ('A','D')),
    deleted_at    timestamptz,
    UNIQUE (tenant_id, code)
);

-- What each buyer role cares about (configurable per tenant)
CREATE TABLE role_focus (
    tenant_id      uuid NOT NULL REFERENCES tenant(id),
    role_category  char(2) NOT NULL CHECK (role_category IN ('EX','FI','OP','IT','OT')),
    focus          text NOT NULL,
    PRIMARY KEY (tenant_id, role_category)
);

-- ---------------------------------------------------------------------
-- Opportunities and their outcome (learning is tied to results)
-- ---------------------------------------------------------------------
CREATE TABLE opportunity (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenant(id),
    code            text NOT NULL,
    company_name    text NOT NULL,
    status          char(1) NOT NULL DEFAULT 'O' CHECK (status IN ('O','W','L','S')),  -- open, won, lost, stalled
    outcome_reason  text,
    closed_at       timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    audit_status    char(1) NOT NULL DEFAULT 'A' CHECK (audit_status IN ('A','D')),
    deleted_at      timestamptz,
    UNIQUE (tenant_id, code)
);

-- ---------------------------------------------------------------------
-- Stakeholders: people at the buyer's company.
-- attended_meeting = false is the absent decision-maker.
-- ---------------------------------------------------------------------
CREATE TABLE stakeholder (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL REFERENCES tenant(id),
    opportunity_id    uuid NOT NULL REFERENCES opportunity(id),
    code              text NOT NULL,
    name              text NOT NULL,
    email             text,
    title             text,
    role_category     char(2) NOT NULL DEFAULT 'OT' CHECK (role_category IN ('EX','FI','OP','IT','OT')),
    attended_meeting  boolean NOT NULL DEFAULT false,
    first_seen_at     timestamptz NOT NULL DEFAULT now(),
    audit_status      char(1) NOT NULL DEFAULT 'A' CHECK (audit_status IN ('A','D')),
    deleted_at        timestamptz,
    UNIQUE (tenant_id, code)
);
CREATE UNIQUE INDEX stakeholder_email_uq ON stakeholder (opportunity_id, lower(email)) WHERE email IS NOT NULL;

-- ---------------------------------------------------------------------
-- Deal brief: what the agent extracts from the transcript
-- ---------------------------------------------------------------------
CREATE TABLE meeting_brief (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             uuid NOT NULL REFERENCES tenant(id),
    code                  text NOT NULL,
    opportunity_id        uuid NOT NULL REFERENCES opportunity(id),
    meeting_at            timestamptz NOT NULL DEFAULT now(),
    transcript            text NOT NULL,
    summary               text,
    needs                 jsonb NOT NULL DEFAULT '[]',   -- [{need, quote, speaker}]
    objections            jsonb NOT NULL DEFAULT '[]',   -- [{objection, quote, speaker, handled}]
    wow_moments           jsonb NOT NULL DEFAULT '[]',   -- [{moment, trigger, quote, speaker}]
    buying_signals        jsonb NOT NULL DEFAULT '[]',
    open_questions        jsonb NOT NULL DEFAULT '[]',
    plan_id               uuid REFERENCES price_plan(id),
    users_count           int,
    module_codes          text[] NOT NULL DEFAULT '{}',
    legal_entities_count  int NOT NULL DEFAULT 1,
    employees_count       int NOT NULL DEFAULT 0,
    vehicles_count        int,
    complexity            char(1) NOT NULL DEFAULT 'M' CHECK (complexity IN ('L','M','H')),
    created_at            timestamptz NOT NULL DEFAULT now(),
    audit_status          char(1) NOT NULL DEFAULT 'A' CHECK (audit_status IN ('A','D')),
    deleted_at            timestamptz,
    UNIQUE (tenant_id, code)
);

-- ---------------------------------------------------------------------
-- Proposal and lines (price frozen when the proposal is generated)
-- ---------------------------------------------------------------------
CREATE TABLE proposal (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        uuid NOT NULL REFERENCES tenant(id),
    code             text NOT NULL,
    opportunity_id   uuid NOT NULL REFERENCES opportunity(id),
    brief_id         uuid NOT NULL REFERENCES meeting_brief(id),
    version          int NOT NULL DEFAULT 1,
    status           char(1) NOT NULL DEFAULT 'D' CHECK (status IN ('D','P','S','V','A','R')),
    public_token     text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
    quote            jsonb NOT NULL,          -- full fn_quote result
    narrative        text,                    -- text written by the model
    approved_by      text,
    approved_at      timestamptz,
    sent_at          timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    audit_status     char(1) NOT NULL DEFAULT 'A' CHECK (audit_status IN ('A','D')),
    deleted_at       timestamptz,
    UNIQUE (tenant_id, code)
);

CREATE TABLE proposal_line (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id    uuid NOT NULL REFERENCES proposal(id) ON DELETE CASCADE,
    line_no        int NOT NULL,
    concept_code   text NOT NULL,
    concept_name   text NOT NULL,
    quantity       numeric(14,2) NOT NULL,
    unit_price     numeric(14,2) NOT NULL,
    currency       char(3) NOT NULL,
    subtotal       numeric(16,2) NOT NULL,
    recurrence     char(1) NOT NULL CHECK (recurrence IN ('M','O')),   -- monthly, one-time
    note           text
);

-- ---------------------------------------------------------------------
-- Signals: everything each stakeholder does with the live proposal
-- ---------------------------------------------------------------------
CREATE TABLE proposal_event (
    id              bigserial PRIMARY KEY,
    proposal_id     uuid NOT NULL REFERENCES proposal(id),
    stakeholder_id  uuid REFERENCES stakeholder(id),
    event_type      char(2) NOT NULL CHECK (event_type IN ('OP','QU','SI','ES','RE')),
    payload         jsonb NOT NULL DEFAULT '{}',
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON proposal_event (proposal_id, created_at);

CREATE SEQUENCE proposal_seq;
CREATE SEQUENCE brief_seq;
CREATE SEQUENCE opportunity_seq;
CREATE SEQUENCE stakeholder_seq;

-- ---------------------------------------------------------------------
-- Labels
-- ---------------------------------------------------------------------
INSERT INTO code_label (domain, code, label) VALUES
 ('audit_status','A','Active'), ('audit_status','D','Deleted'),
 ('pricing_mode','I','Included in license'), ('pricing_mode','E','Per employee'),
 ('complexity','L','Low'), ('complexity','M','Medium'), ('complexity','H','High'),
 ('availability','A','Available'), ('availability','D','In development'), ('availability','N','Not available'),
 ('opportunity_status','O','Open'), ('opportunity_status','W','Won'),
 ('opportunity_status','L','Lost'), ('opportunity_status','S','Stalled'),
 ('proposal_status','D','Draft'), ('proposal_status','P','Approved'), ('proposal_status','S','Sent'),
 ('proposal_status','V','Viewed by customer'), ('proposal_status','A','Accepted'), ('proposal_status','R','Rejected'),
 ('recurrence','M','Monthly'), ('recurrence','O','One-time'),
 ('role_category','EX','Executive'), ('role_category','FI','Finance'), ('role_category','OP','Operations'),
 ('role_category','IT','IT'), ('role_category','OT','Other'),
 ('event_type','OP','Opened the proposal'), ('event_type','QU','Asked a question'),
 ('event_type','SI','Simulated a change'), ('event_type','ES','Escalated to a human'),
 ('event_type','RE','Replied by email'),
 ('attended','true','In the meeting'), ('attended','false','Not in the meeting'),
 ('bool','true','Yes'), ('bool','false','No');
