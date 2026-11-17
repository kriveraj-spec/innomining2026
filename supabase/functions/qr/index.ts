import { deps } from '../_shared/supabase.ts';
import { handleQr } from '../_shared/handlers.mjs';

Deno.serve((req) => handleQr(req, deps));
