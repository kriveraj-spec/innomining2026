import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // rutas relativas: funciona en GitHub Pages (subcarpeta /innomining2026/)
  // La plantilla del correo se comparte con las Edge Functions (../supabase/functions/_shared).
  server: { fs: { allow: ['..'] } },
  build: { target: 'es2020', chunkSizeWarningLimit: 900 }
});
