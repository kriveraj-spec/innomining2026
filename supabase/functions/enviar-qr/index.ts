import { deps } from '../_shared/supabase.ts';
import { handleEnviar } from '../_shared/handlers.mjs';

Deno.serve((req) => handleEnviar(req, deps));
