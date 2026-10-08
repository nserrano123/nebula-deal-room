// Single gateway to Neon, over Neon's serverless HTTP driver (one HTTPS request per query,
// ideal for Vercel functions). Every write goes through a nebula.fn_* function:
// the model proposes, Postgres validates and calculates.
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let client: NeonQueryFunction<false, false> | undefined;

function sql(): NeonQueryFunction<false, false> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured. Copy .env.example to .env.local and set it.");
  }
  client ??= neon(process.env.DATABASE_URL);
  return client;
}

export const TENANT_CODE = process.env.NEBULA_TENANT_CODE ?? "FF";

/** Error raised by a nebula function. Its message is already written for the end user. */
export class NebulaError extends Error {}

export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  try {
    return (await sql().query(text, params)) as T[];
  } catch (e) {
    // RAISE EXCEPTION messages in the nebula functions are user-facing (codes and names, never UUIDs).
    const pgError = e as { code?: string; message?: string } | null;
    if (pgError?.code === "P0001") throw new NebulaError(pgError.message ?? "The database rejected the request.");
    throw e;
  }
}

const FN_NAME = /^fn_[a-z_]+$/;

/** Calls a nebula function that returns jsonb and gives back its value. */
export async function callFn<T = Record<string, unknown>>(fn: string, args: unknown[]): Promise<T> {
  if (!FN_NAME.test(fn)) throw new Error(`Invalid function name: ${fn}`);
  const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
  const rows = await query<{ r: T }>(`select nebula.${fn}(${placeholders}) as r`, args);
  return rows[0].r;
}

// ---------------------------------------------------------------------------
// Catalog reads used to fill prompts and forms
// ---------------------------------------------------------------------------
export type Catalog = {
  tenant: { code: string; name: string; owner_name: string };
  plans: { plan_code: string; plan_name: string }[];
  modules: { module_code: string; module_name: string }[];
};

export async function getCatalog(tenantCode = TENANT_CODE): Promise<Catalog> {
  const [row] = await query<{ catalog: Catalog | null }>(
    `select jsonb_build_object(
              'tenant', jsonb_build_object('code', t.code, 'name', t.name, 'owner_name', t.owner_name),
              'plans', coalesce((select jsonb_agg(jsonb_build_object('plan_code', p.code, 'plan_name', p.name) order by p.code)
                                   from nebula.price_plan p where p.tenant_id = t.id and p.audit_status = 'A'), '[]'),
              'modules', coalesce((select jsonb_agg(jsonb_build_object('module_code', m.code, 'module_name', m.name) order by m.code)
                                     from nebula.product_module m where m.tenant_id = t.id and m.audit_status = 'A'), '[]')
            ) as catalog
       from nebula.tenant t
      where t.code = $1 and t.audit_status = 'A'`,
    [tenantCode],
  );
  if (!row?.catalog) throw new NebulaError(`Tenant ${tenantCode} does not exist or was deleted.`);
  return row.catalog;
}
