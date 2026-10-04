-- =====================================================================
-- Nebula · Seed data for customer zero: Fail Fast
-- Values marked [CONFIRM] are placeholders; review them before the demo.
-- =====================================================================
SET search_path TO nebula;

INSERT INTO tenant (code, name, owner_name, agent_max_discount_pct)
VALUES ('FF', 'Fail Fast', 'Natalia Serrano', 0);   -- the agent never grants discounts on its own

-- ---------------------------------------------------------------------
-- Plans
-- ---------------------------------------------------------------------
INSERT INTO price_plan (tenant_id, code, name, price_per_user, currency, min_billable_users,
                        additional_entity_price, additional_entity_pct,
                        impl_hour_rate, impl_currency, impl_hours_per_user)
SELECT id, 'TR', 'Transportation', 120, 'USD', 15,
       350, NULL,
       50, 'USD', 2            -- [CONFIRM] hourly rate and training hours per user
  FROM tenant WHERE code = 'FF';

INSERT INTO price_plan (tenant_id, code, name, price_per_user, currency, min_billable_users,
                        additional_entity_price, additional_entity_pct,
                        impl_hour_rate, impl_currency, impl_hours_per_user)
SELECT id, 'CO', 'Construction', 350000, 'COP', 1,   -- [CONFIRM] minimum users
       NULL, 10,                                     -- 10% of license per additional project or entity
       200000, 'COP', 2                              -- [CONFIRM] hourly rate
  FROM tenant WHERE code = 'FF';

-- ---------------------------------------------------------------------
-- Modules (base implementation hours: [CONFIRM])
-- ---------------------------------------------------------------------
INSERT INTO product_module (tenant_id, code, name, pricing_mode, price_per_unit, currency,
                            min_billable_units, max_quotable_units, base_impl_hours)
SELECT t.id, v.code, v.name, v.mode, v.price, v.cur, v.min_u, v.max_u, v.hours
  FROM tenant t,
       (VALUES ('ERP', 'ERP (accounting, treasury, payables, purchasing, inventory, invoicing)',
                'I', NULL::numeric, NULL, NULL::int, NULL::int, 160),
               ('TMS', 'TMS (transportation management)', 'I', NULL, NULL, NULL, NULL, 80),
               ('CRM', 'CRM',                             'I', NULL, NULL, NULL, NULL, 24),
               ('PRJ', 'Projects and job sites',          'I', NULL, NULL, NULL, NULL, 100),
               ('AI',  'AI agent',                        'I', NULL, NULL, NULL, NULL, 16),
               ('PAY', 'Payroll',                         'E', 15000, 'COP', 10, 500, 40)
       ) AS v(code, name, mode, price, cur, min_u, max_u, hours)
 WHERE t.code = 'FF';

INSERT INTO impl_complexity (tenant_id, code, multiplier)
SELECT id, c, m FROM tenant, (VALUES ('L', 1.00), ('M', 1.25), ('H', 1.50)) AS x(c, m)   -- [CONFIRM]
 WHERE code = 'FF';

-- ---------------------------------------------------------------------
-- What each role cares about
-- ---------------------------------------------------------------------
INSERT INTO role_focus (tenant_id, role_category, focus)
SELECT t.id, v.r, v.f FROM tenant t, (VALUES
 ('EX', 'Business outcome, risk of the change, how fast the team sees results, who else in their industry runs on it.'),
 ('FI', 'Total monthly and one-time cost, cost per vehicle, what manual work it removes, month-end close and tax compliance.'),
 ('OP', 'Rollout plan, disruption to daily operations, training, what changes for the team on day one.'),
 ('IT', 'Integrations, data migration, security, access control, cloud hosting.'),
 ('OT', 'The needs their colleagues raised in the meeting and the next step.')
) AS v(r, f) WHERE t.code = 'FF';

-- ---------------------------------------------------------------------
-- Product knowledge: the only things the agent may claim.
-- A = available, D = in development, N = not available.
-- ---------------------------------------------------------------------
INSERT INTO product_fact (tenant_id, code, topic, content, availability)
SELECT t.id, v.code, v.topic, v.content, v.av
  FROM tenant t,
       (VALUES
        ('POS-01', 'Positioning', 'Fail Fast is a cloud ERP with AI agents for companies in Colombia and Latin America, strongest in freight transportation.', 'A'),
        ('PRC-01', 'Pricing', 'License per user per month with all modules included; automations are included in the license.', 'A'),
        ('PRC-02', 'Pricing', 'Payroll is priced per employee processed, with a 10-employee minimum; above 500 employees it is negotiated.', 'A'),
        ('IMP-01', 'Implementation', 'A typical implementation takes 3 to 4 months and runs in parallel with daily operations.', 'A'),
        ('ACC-01', 'Accounting', 'Posts the journal entry in real time from every operation, applies the daily exchange rate and keeps books under multiple standards (financial and tax) without duplicate work.', 'A'),
        ('TRE-01', 'Treasury', 'Bank reconciliation is performed by an AI agent; people only review the exceptions.', 'A'),
        ('TRE-02', 'Treasury', 'Projected cash flow.', 'N'),
        ('TRE-03', 'Treasury', 'Paying suppliers directly from Fail Fast through Open Banking, without logging into the bank portal.', 'D'),
        ('PAY-01', 'Accounts payable', 'Receives supplier invoices from the tax authority (DIAN) and from the email inbox, books them automatically, validates the supplier, matches them to the purchase order and applies advances.', 'A'),
        ('PAY-02', 'Accounts payable', 'Approval workflows by owner, electronic acceptance or rejection events with the tax authority, and a supplier portal for invoices, withholdings and payments.', 'A'),
        ('INV-01', 'Invoicing', 'Fail Fast is an authorized e-invoicing technology provider for the Colombian tax authority (DIAN): it issues and validates electronic invoices with no intermediaries.', 'A'),
        ('INV-02', 'Invoicing', 'Invoices from orders, delivery notes or contracts; consolidates several orders into one invoice; price lists with validity, currency and maximum discount; calculates tax withholding.', 'A'),
        ('PUR-01', 'Purchasing', 'Natural-language product search, AI-suggested replenishment and side-by-side comparison of supplier quotes.', 'A'),
        ('STK-01', 'Inventory', 'Real-time average cost, own and third-party warehouses, consignment, multiple units of measure, lots, reorder points and physical counts with automatic accounting adjustments.', 'A'),
        ('AI-01',  'AI', 'Freight cost estimation against the official SICE-TAC reference, in natural language; free trial at failfast.ai.', 'A'),
        ('AI-02',  'AI', 'Automatic vehicle creation through integration with the national vehicle registry (RUNT).', 'A'),
        ('AI-03',  'AI', 'Agent that creates shipment documents (remesas).', 'D'),
        ('AI-04',  'AI', 'Connector for Claude: users can ask the ERP questions from Claude.', 'A')
       ) AS v(code, topic, content, av)
 WHERE t.code = 'FF';
