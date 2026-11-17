// Servidor que imita la API v3 de Brevo para pruebas (NO envía correos reales).
// Permite simular: aceptado, rebote por destinatario, cuota (429), caída (500), remitente inválido y tiempo agotado.
import http from 'node:http';
import crypto from 'node:crypto';

export async function iniciarBrevoFalso({ clave = 'xkeysib-clave-de-prueba', remitente = 'acreditacion@innomining.test' } = {}) {
  const st = { enviados: [], modo: 'ok', demoraMs: 0, rechazar: /rebota/ };
  const server = http.createServer((req, res) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      const out = (code, d) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(d)); };
      if (req.headers['api-key'] !== clave) return out(401, { code: 'unauthorized', message: 'Key not found' });
      if (url.pathname === '/v3/account') {
        return out(200, { email: 'cuenta@innomining.test', companyName: 'ISEE UNSA', plan: [{ type: 'free', credits: 300, creditsType: 'sendLimit' }], relay: { enabled: true } });
      }
      if (url.pathname === '/v3/senders') return out(200, { senders: [{ id: 1, name: 'INNOMINING 2026', email: remitente, active: true }] });
      if (url.pathname === '/v3/smtp/emails' && req.method === 'GET') {
        const email = url.searchParams.get('email');
        return out(200, { count: 1, transactionalEmails: st.enviados.filter((e) => e.to === email).map((e) => ({ email: e.to, messageId: e.messageId, tags: e.tags, subject: e.subject, date: e.fecha })) });
      }
      if (url.pathname === '/v3/smtp/email' && req.method === 'POST') {
        const p = JSON.parse(b);
        if (st.modo === '429') return out(429, { code: 'too_many_requests', message: 'Too many requests' });
        if (st.modo === '500') return out(500, { code: 'internal', message: 'Internal error' });
        if (p.sender.email !== remitente) return out(400, { code: 'invalid_parameter', message: 'Sender is invalid / inactive' });
        const to = p.to[0].email;
        if (st.rechazar.test(to)) return out(400, { code: 'invalid_parameter', message: `email is not valid in to (${to})` });
        const messageId = `<${crypto.randomUUID()}@smtp-relay.mailin.fr>`;
        st.enviados.push({ to, messageId, tags: p.tags, subject: p.subject, html: p.htmlContent, adjuntos: p.attachment, fecha: new Date().toISOString() });
        if (st.modo === 'timeout') return setTimeout(() => out(201, { messageId }), st.demoraMs || 3000); // Brevo aceptó, pero la respuesta no llega a tiempo
        return out(201, { messageId });
      }
      out(404, { message: 'not found' });
    });
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  return { base: `http://127.0.0.1:${server.address().port}/v3`, clave, remitente, st, cerrar: () => new Promise((ok) => server.close(ok)) };
}
