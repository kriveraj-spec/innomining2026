// Adaptador para Supabase Edge Functions (Deno): cliente con service_role y verificación del JWT.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false }
});

export const deps = {
  env: (k: string) => Deno.env.get(k) ?? '',
  fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
  async rpc(fn: string, args: Record<string, unknown>) {
    const { data, error } = await admin.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data;
  },
  async user(jwt: string) {
    const { data, error } = await admin.auth.getUser(jwt);
    return error || !data.user ? null : { id: data.user.id, email: data.user.email };
  }
};
