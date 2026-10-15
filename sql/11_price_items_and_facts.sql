-- =====================================================================
-- Fail Fast · priced extras and product facts used when updating proposals.
-- confirmed = false marks a price proposed but not yet confirmed by the owner;
-- the console shows it as such and the agent says it is to be confirmed.
-- =====================================================================
SET search_path = nebula, public;

INSERT INTO price_item (tenant_id, code, name, unit_label, price, currency, recurrence, confirmed)
SELECT t.id, v.code, v.name, v.unit, v.price, v.cur, v.rec, v.ok
  FROM tenant t,
       (VALUES
        ('USERS',       'Usuarios del sistema (acceso a ERP y TMS)', 'usuario/mes',   99,     'USD', 'M', true),
        ('AGENT',       'Agente de IA',                              'agente/mes',    100,    'USD', 'M', true),
        ('EDOC-3000',   'Documentos electrónicos · hasta 3.000',     'paquete/mes',   250,    'USD', 'M', true),
        ('EDOC-6000',   'Documentos electrónicos · hasta 6.000',     'paquete/mes',   450,    'USD', 'M', false),
        ('EDOC-10000',  'Documentos electrónicos · hasta 10.000',    'paquete/mes',   700,    'USD', 'M', false),
        ('EDOC-EXTRA',  'Documento electrónico adicional sobre 10.000', 'documento',  0.06,   'USD', 'U', false),
        ('STORAGE',     'Almacenamiento · 50 GB incluidos',          'mes',           0,      'USD', 'M', true),
        ('DEV-HOUR',    'Hora de desarrollo a la medida',            'hora',          82,     'USD', 'O', true)
       ) AS v(code, name, unit, price, cur, rec, ok)
 WHERE t.code = 'FF'
ON CONFLICT (tenant_id, code) DO UPDATE
   SET name = EXCLUDED.name, unit_label = EXCLUDED.unit_label, price = EXCLUDED.price,
       currency = EXCLUDED.currency, recurrence = EXCLUDED.recurrence, confirmed = EXCLUDED.confirmed;

INSERT INTO product_fact (tenant_id, code, topic, content, availability)
SELECT t.id, v.code, v.topic, v.content, v.av
  FROM tenant t,
       (VALUES
        ('TMS-01', 'Fleet monitoring', 'Fail Fast has no satellite tracking of its own: it connects to the customer''s GPS providers (Satrack, Control T, Monitor and others) and records their events on each manifest. These integrations have no additional cost, also when the customer changes provider.', 'A'),
        ('TMS-02', 'Logistics times', 'Loading and unloading times are recorded per manifest and shipment; the system calculates what to pay the driver and what to charge the customer, and the traffic team approves it. Times can be synchronized with RNDC.', 'A'),
        ('TMS-03', 'SICE-TAC', 'The service order and the shipment check the official SICE-TAC reference rate online; if the reference rose above the quoted value, the shipment is blocked until the price is renegotiated.', 'A'),
        ('DOC-01', 'Document management', 'Configurable folders per vehicle, driver, holder and owner (licenses, SOAT, medical exams, background checks); a standard template is delivered at start and the customer adapts it. No external document manager is needed.', 'A'),
        ('DOC-02', 'Document management', 'Approval workflows: a document uploaded by an owner or driver is routed to a user or area that approves or rejects it, and it stays in the record.', 'A'),
        ('DOC-03', 'Document management', 'A simple link, sent by WhatsApp, for drivers to upload their documents without registering, with ID scanning.', 'D'),
        ('WF-01',  'Workflows', 'Workflows can talk to drivers and carriers through the company''s WhatsApp: send documents, receive documents and schedule periodic check-ins. WhatsApp messages are billed by Meta to the customer.', 'A'),
        ('RPT-01', 'Reporting', 'Configurable dashboards for shipments, customers, drivers, vehicles and operations, plus saved views that export to Excel.', 'A'),
        ('CRM-01', 'CRM', 'CRM with leads and opportunities in the same platform.', 'A'),
        ('AI-05',  'AI', 'MCP connection to Claude or ChatGPT: users query the database in natural language (lists, charts, reports). Fail Fast charges nothing for it; the customer pays only its own AI subscription.', 'A'),
        ('LOG-01', 'Parcel delivery', 'Multi-client parcel operations are integrated by web service so orders become shipments and manifests; each integration is quoted according to the client.', 'A'),
        ('WMS-01', 'Warehouse management', 'Detailed WMS (aisles, locations, picking) in the current version. Today there is inventory with in-transit stock; the full WMS is planned for April 1, 2027.', 'D'),
        ('IMP-02', 'Implementation', 'Scrum with two-week sprints, a fixed daily one-hour working session with each area, a progress review every 15 days and a permanent WhatsApp group with the customer.', 'A'),
        ('IMP-03', 'Implementation', 'Customers can load master data and opening balances themselves with import templates; a monitor shows which records loaded and which failed.', 'A')
       ) AS v(code, topic, content, av)
 WHERE t.code = 'FF'
ON CONFLICT (tenant_id, code) DO UPDATE SET topic = EXCLUDED.topic, content = EXCLUDED.content, availability = EXCLUDED.availability;
