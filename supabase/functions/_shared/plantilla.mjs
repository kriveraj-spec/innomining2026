// Plantilla institucional del correo (la misma se usa en la vista previa del panel).
// HTML con tablas y estilos en línea: compatible con Gmail, Outlook y clientes móviles.

export const ASUNTO = 'INNOMINING 2026 | Tu código QR de acreditación';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const F = "font-family:Arial,Helvetica,sans-serif;";
const p = (t) => `<p style="margin:0 0 14px;">${t}</p>`;

/**
 * @param {{nombre:string, codigo:string, imgSrc:string}} d  imgSrc: URL pública del PNG (o data: en la vista previa)
 */
export function correoHtml(d) {
  const nombre = esc(d.nombre || 'Participante');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(ASUNTO)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f6;padding:28px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e6e6eb;border-radius:12px;">
  <tr><td style="padding:26px 32px 0;${F}">
    <div style="font-size:12px;letter-spacing:1.5px;color:#5b52e5;font-weight:bold;">ACREDITACIÓN</div>
    <div style="font-size:24px;line-height:30px;font-weight:bold;color:#16161d;margin-top:2px;">INNOMINING 2026</div>
  </td></tr>
  <tr><td style="padding:20px 32px 6px;${F}font-size:15px;line-height:23px;color:#2a2a33;">
    ${p('Estimado(a) participante:')}
    ${p('Gracias por registrarte en el Congreso INNOMINING 2026.')}
    ${p('Te compartimos tu código QR personal, el cual deberás presentar al momento de ingresar al evento para registrar tu asistencia.')}
  </td></tr>
  <tr><td align="center" style="padding:6px 32px 22px;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="border:1px solid #e6e6eb;border-radius:10px;">
      <tr><td align="center" style="padding:18px 22px 8px;"><img src="${esc(d.imgSrc)}" width="220" height="220" alt="Código QR de acreditación" style="display:block;width:220px;height:220px;border:0;"></td></tr>
      <tr><td align="center" style="padding:0 22px 18px;${F}">
        <div style="font-size:17px;font-weight:bold;color:#16161d;">${nombre}</div>
        <div style="font-family:Consolas,Menlo,monospace;font-size:14px;color:#6b6b76;margin-top:4px;letter-spacing:1px;">${esc(d.codigo)}</div>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:0 32px 8px;${F}font-size:15px;line-height:23px;color:#2a2a33;">
    ${p('Puedes guardar el código en tu celular. No será necesario imprimirlo.')}
    ${p('Este QR estará asociado a tu registro durante el congreso.')}
    <p style="margin:0 0 18px;font-size:13px;color:#6b6b76;">El QR también va adjunto como imagen PNG por si no se muestra arriba.</p>
  </td></tr>
  <tr><td style="padding:18px 32px 26px;border-top:1px solid #efeff3;${F}font-size:14px;line-height:21px;color:#2a2a33;">
    Atentamente,<br><b>Comité Organizador</b><br>INNOMINING 2026
  </td></tr>
</table>
<div style="${F}font-size:11px;line-height:16px;color:#8d8d97;max-width:560px;margin-top:12px;">Recibes este mensaje porque te registraste en el Congreso INNOMINING 2026. El código es personal: no lo compartas.</div>
</td></tr></table></body></html>`;
}

export function correoTexto(d) {
  return `Estimado(a) participante:

Gracias por registrarte en el Congreso INNOMINING 2026.

Te compartimos tu código QR personal (adjunto como imagen), el cual deberás presentar al momento de ingresar al evento para registrar tu asistencia.

Puedes guardar el código en tu celular. No será necesario imprimirlo.

Este QR estará asociado a tu registro durante el congreso.

Participante: ${d.nombre || ''}
Código: ${d.codigo}

Atentamente,
Comité Organizador
INNOMINING 2026`;
}
