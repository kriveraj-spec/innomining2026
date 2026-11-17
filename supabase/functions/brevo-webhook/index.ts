import { deps } from '../_shared/supabase.ts';
import { handleWebhook } from '../_shared/handlers.mjs';

Deno.serve((req) => handleWebhook(req, deps));
