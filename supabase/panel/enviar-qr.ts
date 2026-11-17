// INNOMINING 2026 · Edge Function "enviar-qr" (archivo único para pegar en Supabase → Edge Functions → Deploy a new function → Via Editor)
// @ts-nocheck
// ../../../tmp/claude-0/-home-user/e2cf194f-2e12-5fb1-a6f3-59bbbc3c89d9/scratchpad/bund/enviar-qr.ts
import { createClient } from "npm:@supabase/supabase-js@2";

// supabase/functions/_shared/plantilla.mjs
var ASUNTO = "INNOMINING 2026 | Tu c\xF3digo QR de acreditaci\xF3n";
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
var F = "font-family:Arial,Helvetica,sans-serif;";
var p = (t) => `<p style="margin:0 0 14px;">${t}</p>`;
function saludo(nombre) {
  return nombre ? `Estimado(a) ${esc(nombre)}:` : "Estimado(a) participante:";
}
function bloqueEvento(d) {
  if (!d.fecha && !d.lugar) return "";
  const fila = (k, v) => v ? `<tr><td style="padding:3px 14px 3px 0;color:#6b6b76;white-space:nowrap;vertical-align:top;">${k}</td><td style="padding:3px 0;color:#16161d;font-weight:bold;">${esc(v)}</td></tr>` : "";
  return `<tr><td style="padding:0 32px 18px;"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f6f6fb;border-radius:10px;">
    <tr><td style="padding:14px 18px;${F}font-size:14px;line-height:20px;"><table role="presentation" cellpadding="0" cellspacing="0">${fila("Fecha", d.fecha)}${fila("Lugar", d.lugar)}</table></td></tr></table></td></tr>`;
}
function correoHtml(d) {
  const nombre = esc(d.nombre || "Participante");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(ASUNTO)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f6;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Tu c\xF3digo QR personal para ingresar al Congreso INNOMINING 2026. Gu\xE1rdalo en tu celular.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f6;padding:28px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e6e6eb;border-radius:12px;">
  <tr><td style="padding:26px 32px 0;${F}">
    <div style="font-size:12px;letter-spacing:1.5px;color:#5b52e5;font-weight:bold;">ACREDITACI\xD3N</div>
    <div style="font-size:24px;line-height:30px;font-weight:bold;color:#16161d;margin-top:2px;">INNOMINING 2026</div>
  </td></tr>
  <tr><td style="padding:20px 32px 6px;${F}font-size:15px;line-height:23px;color:#2a2a33;">
    ${p(saludo(d.nombre))}
    ${p("Gracias por registrarte en el Congreso INNOMINING 2026.")}
    ${p("Te compartimos tu c\xF3digo QR personal, el cual deber\xE1s presentar al momento de ingresar al evento para registrar tu asistencia.")}
  </td></tr>
  ${bloqueEvento(d)}
  <tr><td align="center" style="padding:6px 32px 22px;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="border:1px solid #e6e6eb;border-radius:10px;">
      <tr><td align="center" style="padding:18px 22px 8px;"><img src="${esc(d.imgSrc)}" width="220" height="220" alt="C\xF3digo QR de acreditaci\xF3n" style="display:block;width:220px;height:220px;border:0;"></td></tr>
      <tr><td align="center" style="padding:0 22px 18px;${F}">
        <div style="font-size:17px;font-weight:bold;color:#16161d;">${nombre}</div>
        <div style="font-family:Consolas,Menlo,monospace;font-size:14px;color:#6b6b76;margin-top:4px;letter-spacing:1px;">${esc(d.codigo)}</div>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:0 32px 8px;${F}font-size:15px;line-height:23px;color:#2a2a33;">
    ${p("Puedes guardar el c\xF3digo en tu celular. No ser\xE1 necesario imprimirlo.")}
    ${p("Este QR estar\xE1 asociado a tu registro durante el congreso.")}
    <p style="margin:0 0 18px;font-size:13px;color:#6b6b76;">El QR tambi\xE9n va adjunto como imagen PNG por si no se muestra arriba.</p>
  </td></tr>
  <tr><td style="padding:18px 32px 26px;border-top:1px solid #efeff3;${F}font-size:14px;line-height:21px;color:#2a2a33;">
    Atentamente,<br><b>Comit\xE9 Organizador</b><br>INNOMINING 2026
  </td></tr>
</table>
<div style="${F}font-size:11px;line-height:16px;color:#8d8d97;max-width:560px;margin-top:12px;">Recibes este mensaje porque te registraste en el Congreso INNOMINING 2026. El c\xF3digo es personal: no lo compartas.</div>
</td></tr></table></body></html>`;
}
function correoTexto(d) {
  return `${d.nombre ? `Estimado(a) ${d.nombre}:` : "Estimado(a) participante:"}

Gracias por registrarte en el Congreso INNOMINING 2026.

Te compartimos tu c\xF3digo QR personal (adjunto como imagen), el cual deber\xE1s presentar al momento de ingresar al evento para registrar tu asistencia.

Puedes guardar el c\xF3digo en tu celular. No ser\xE1 necesario imprimirlo.

Este QR estar\xE1 asociado a tu registro durante el congreso.

Participante: ${d.nombre || ""}
C\xF3digo: ${d.codigo}${d.fecha ? `
Fecha: ${d.fecha}` : ""}${d.lugar ? `
Lugar: ${d.lugar}` : ""}

Atentamente,
Comit\xE9 Organizador
INNOMINING 2026`;
}

// supabase/functions/_shared/brevo.mjs
var BREVO_BASE = "https://api.brevo.com/v3";
function normalizarClave(k) {
  const v = String(k || "").trim();
  if (!v || v.startsWith("xkeysib-")) return v;
  try {
    const j = JSON.parse(atob(v));
    if (j && typeof j.api_key === "string") return j.api_key.trim();
  } catch (_) {
  }
  return v;
}
async function llamar(cfg, method, path, body) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), cfg.timeoutMs || 2e4);
  try {
    const res = await cfg.fetch(cfg.base + path, {
      method,
      headers: { "api-key": cfg.key, accept: "application/json", ...body ? { "content-type": "application/json" } : {} },
      body: body ? JSON.stringify(body) : void 0,
      signal: ctl.signal
    });
    let data = {};
    try {
      data = await res.json();
    } catch (_) {
    }
    return { status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}
function mensaje(r) {
  return `Brevo ${r.status}: ${r.data.message || r.data.code || "error"}`;
}
async function enviar(cfg, payload) {
  let r;
  try {
    r = await llamar(cfg, "POST", "/smtp/email", payload);
  } catch (e) {
    const t = e && e.name === "AbortError" ? "tiempo de espera agotado" : String(e && e.message || e);
    return { resultado: "incierto", error: `Sin respuesta de Brevo (${t}). Verifique antes de reenviar.`, detener: true };
  }
  if (r.status >= 200 && r.status < 300) {
    return { resultado: "aceptado", messageId: r.data.messageId || (r.data.messageIds || [])[0] || null };
  }
  const msg = mensaje(r);
  if (r.status === 401 || r.status === 403) {
    return {
      resultado: "temporal",
      detener: true,
      config: true,
      error: `${msg}. Revise la clave de Brevo y, en Brevo \u2192 Seguridad \u2192 IP autorizadas, desactive el bloqueo de IP desconocidas.`
    };
  }
  if (r.status === 402 || r.status === 429) return { resultado: "temporal", detener: true, cuota: true, error: `${msg}. Cuota o cr\xE9ditos de Brevo agotados.` };
  if (r.status >= 500) return { resultado: "temporal", detener: true, error: `${msg}. Brevo no disponible.` };
  if (/sender|from/i.test(msg)) {
    return { resultado: "temporal", detener: true, config: true, error: `${msg}. El remitente no es v\xE1lido o no est\xE1 verificado en Brevo.` };
  }
  return { resultado: "fallido", error: msg };
}
async function cuenta(cfg) {
  return llamar(cfg, "GET", "/account");
}
async function remitentes(cfg) {
  return llamar(cfg, "GET", "/senders");
}
async function buscarEnvio(cfg, email, etiqueta, desde) {
  const fmt = (d) => d.toISOString().slice(0, 10);
  const hasta = new Date(Date.now() + 864e5);
  const q = `?email=${encodeURIComponent(email)}&startDate=${fmt(desde)}&endDate=${fmt(hasta)}&limit=100&sort=desc`;
  const r = await llamar(cfg, "GET", "/smtp/emails" + q);
  if (r.status !== 200) return { error: mensaje(r) };
  const hit = (r.data.transactionalEmails || []).find((e) => (e.tags || []).includes(etiqueta));
  return { encontrado: !!hit, messageId: hit ? hit.messageId : null };
}

// supabase/functions/_shared/qrcode.mjs
var qrcode = function() {
  var qrcode2 = function(typeNumber, errorCorrectionLevel) {
    var PAD0 = 236;
    var PAD1 = 17;
    var _typeNumber = typeNumber;
    var _errorCorrectionLevel = QRErrorCorrectionLevel[errorCorrectionLevel];
    var _modules = null;
    var _moduleCount = 0;
    var _dataCache = null;
    var _dataList = [];
    var _this = {};
    var makeImpl = function(test, maskPattern) {
      _moduleCount = _typeNumber * 4 + 17;
      _modules = function(moduleCount) {
        var modules = new Array(moduleCount);
        for (var row = 0; row < moduleCount; row += 1) {
          modules[row] = new Array(moduleCount);
          for (var col = 0; col < moduleCount; col += 1) {
            modules[row][col] = null;
          }
        }
        return modules;
      }(_moduleCount);
      setupPositionProbePattern(0, 0);
      setupPositionProbePattern(_moduleCount - 7, 0);
      setupPositionProbePattern(0, _moduleCount - 7);
      setupPositionAdjustPattern();
      setupTimingPattern();
      setupTypeInfo(test, maskPattern);
      if (_typeNumber >= 7) {
        setupTypeNumber(test);
      }
      if (_dataCache == null) {
        _dataCache = createData(_typeNumber, _errorCorrectionLevel, _dataList);
      }
      mapData(_dataCache, maskPattern);
    };
    var setupPositionProbePattern = function(row, col) {
      for (var r = -1; r <= 7; r += 1) {
        if (row + r <= -1 || _moduleCount <= row + r) continue;
        for (var c = -1; c <= 7; c += 1) {
          if (col + c <= -1 || _moduleCount <= col + c) continue;
          if (0 <= r && r <= 6 && (c == 0 || c == 6) || 0 <= c && c <= 6 && (r == 0 || r == 6) || 2 <= r && r <= 4 && 2 <= c && c <= 4) {
            _modules[row + r][col + c] = true;
          } else {
            _modules[row + r][col + c] = false;
          }
        }
      }
    };
    var getBestMaskPattern = function() {
      var minLostPoint = 0;
      var pattern = 0;
      for (var i = 0; i < 8; i += 1) {
        makeImpl(true, i);
        var lostPoint = QRUtil.getLostPoint(_this);
        if (i == 0 || minLostPoint > lostPoint) {
          minLostPoint = lostPoint;
          pattern = i;
        }
      }
      return pattern;
    };
    var setupTimingPattern = function() {
      for (var r = 8; r < _moduleCount - 8; r += 1) {
        if (_modules[r][6] != null) {
          continue;
        }
        _modules[r][6] = r % 2 == 0;
      }
      for (var c = 8; c < _moduleCount - 8; c += 1) {
        if (_modules[6][c] != null) {
          continue;
        }
        _modules[6][c] = c % 2 == 0;
      }
    };
    var setupPositionAdjustPattern = function() {
      var pos = QRUtil.getPatternPosition(_typeNumber);
      for (var i = 0; i < pos.length; i += 1) {
        for (var j = 0; j < pos.length; j += 1) {
          var row = pos[i];
          var col = pos[j];
          if (_modules[row][col] != null) {
            continue;
          }
          for (var r = -2; r <= 2; r += 1) {
            for (var c = -2; c <= 2; c += 1) {
              if (r == -2 || r == 2 || c == -2 || c == 2 || r == 0 && c == 0) {
                _modules[row + r][col + c] = true;
              } else {
                _modules[row + r][col + c] = false;
              }
            }
          }
        }
      }
    };
    var setupTypeNumber = function(test) {
      var bits = QRUtil.getBCHTypeNumber(_typeNumber);
      for (var i = 0; i < 18; i += 1) {
        var mod = !test && (bits >> i & 1) == 1;
        _modules[Math.floor(i / 3)][i % 3 + _moduleCount - 8 - 3] = mod;
      }
      for (var i = 0; i < 18; i += 1) {
        var mod = !test && (bits >> i & 1) == 1;
        _modules[i % 3 + _moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
      }
    };
    var setupTypeInfo = function(test, maskPattern) {
      var data = _errorCorrectionLevel << 3 | maskPattern;
      var bits = QRUtil.getBCHTypeInfo(data);
      for (var i = 0; i < 15; i += 1) {
        var mod = !test && (bits >> i & 1) == 1;
        if (i < 6) {
          _modules[i][8] = mod;
        } else if (i < 8) {
          _modules[i + 1][8] = mod;
        } else {
          _modules[_moduleCount - 15 + i][8] = mod;
        }
      }
      for (var i = 0; i < 15; i += 1) {
        var mod = !test && (bits >> i & 1) == 1;
        if (i < 8) {
          _modules[8][_moduleCount - i - 1] = mod;
        } else if (i < 9) {
          _modules[8][15 - i - 1 + 1] = mod;
        } else {
          _modules[8][15 - i - 1] = mod;
        }
      }
      _modules[_moduleCount - 8][8] = !test;
    };
    var mapData = function(data, maskPattern) {
      var inc = -1;
      var row = _moduleCount - 1;
      var bitIndex = 7;
      var byteIndex = 0;
      var maskFunc = QRUtil.getMaskFunction(maskPattern);
      for (var col = _moduleCount - 1; col > 0; col -= 2) {
        if (col == 6) col -= 1;
        while (true) {
          for (var c = 0; c < 2; c += 1) {
            if (_modules[row][col - c] == null) {
              var dark = false;
              if (byteIndex < data.length) {
                dark = (data[byteIndex] >>> bitIndex & 1) == 1;
              }
              var mask = maskFunc(row, col - c);
              if (mask) {
                dark = !dark;
              }
              _modules[row][col - c] = dark;
              bitIndex -= 1;
              if (bitIndex == -1) {
                byteIndex += 1;
                bitIndex = 7;
              }
            }
          }
          row += inc;
          if (row < 0 || _moduleCount <= row) {
            row -= inc;
            inc = -inc;
            break;
          }
        }
      }
    };
    var createBytes = function(buffer, rsBlocks) {
      var offset = 0;
      var maxDcCount = 0;
      var maxEcCount = 0;
      var dcdata = new Array(rsBlocks.length);
      var ecdata = new Array(rsBlocks.length);
      for (var r = 0; r < rsBlocks.length; r += 1) {
        var dcCount = rsBlocks[r].dataCount;
        var ecCount = rsBlocks[r].totalCount - dcCount;
        maxDcCount = Math.max(maxDcCount, dcCount);
        maxEcCount = Math.max(maxEcCount, ecCount);
        dcdata[r] = new Array(dcCount);
        for (var i = 0; i < dcdata[r].length; i += 1) {
          dcdata[r][i] = 255 & buffer.getBuffer()[i + offset];
        }
        offset += dcCount;
        var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
        var rawPoly = qrPolynomial(dcdata[r], rsPoly.getLength() - 1);
        var modPoly = rawPoly.mod(rsPoly);
        ecdata[r] = new Array(rsPoly.getLength() - 1);
        for (var i = 0; i < ecdata[r].length; i += 1) {
          var modIndex = i + modPoly.getLength() - ecdata[r].length;
          ecdata[r][i] = modIndex >= 0 ? modPoly.getAt(modIndex) : 0;
        }
      }
      var totalCodeCount = 0;
      for (var i = 0; i < rsBlocks.length; i += 1) {
        totalCodeCount += rsBlocks[i].totalCount;
      }
      var data = new Array(totalCodeCount);
      var index = 0;
      for (var i = 0; i < maxDcCount; i += 1) {
        for (var r = 0; r < rsBlocks.length; r += 1) {
          if (i < dcdata[r].length) {
            data[index] = dcdata[r][i];
            index += 1;
          }
        }
      }
      for (var i = 0; i < maxEcCount; i += 1) {
        for (var r = 0; r < rsBlocks.length; r += 1) {
          if (i < ecdata[r].length) {
            data[index] = ecdata[r][i];
            index += 1;
          }
        }
      }
      return data;
    };
    var createData = function(typeNumber2, errorCorrectionLevel2, dataList) {
      var rsBlocks = QRRSBlock.getRSBlocks(typeNumber2, errorCorrectionLevel2);
      var buffer = qrBitBuffer();
      for (var i = 0; i < dataList.length; i += 1) {
        var data = dataList[i];
        buffer.put(data.getMode(), 4);
        buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber2));
        data.write(buffer);
      }
      var totalDataCount = 0;
      for (var i = 0; i < rsBlocks.length; i += 1) {
        totalDataCount += rsBlocks[i].dataCount;
      }
      if (buffer.getLengthInBits() > totalDataCount * 8) {
        throw "code length overflow. (" + buffer.getLengthInBits() + ">" + totalDataCount * 8 + ")";
      }
      if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
        buffer.put(0, 4);
      }
      while (buffer.getLengthInBits() % 8 != 0) {
        buffer.putBit(false);
      }
      while (true) {
        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD0, 8);
        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD1, 8);
      }
      return createBytes(buffer, rsBlocks);
    };
    _this.addData = function(data, mode) {
      mode = mode || "Byte";
      var newData = null;
      switch (mode) {
        case "Numeric":
          newData = qrNumber(data);
          break;
        case "Alphanumeric":
          newData = qrAlphaNum(data);
          break;
        case "Byte":
          newData = qr8BitByte(data);
          break;
        case "Kanji":
          newData = qrKanji(data);
          break;
        default:
          throw "mode:" + mode;
      }
      _dataList.push(newData);
      _dataCache = null;
    };
    _this.isDark = function(row, col) {
      if (row < 0 || _moduleCount <= row || col < 0 || _moduleCount <= col) {
        throw row + "," + col;
      }
      return _modules[row][col];
    };
    _this.getModuleCount = function() {
      return _moduleCount;
    };
    _this.make = function() {
      if (_typeNumber < 1) {
        var typeNumber2 = 1;
        for (; typeNumber2 < 40; typeNumber2++) {
          var rsBlocks = QRRSBlock.getRSBlocks(typeNumber2, _errorCorrectionLevel);
          var buffer = qrBitBuffer();
          for (var i = 0; i < _dataList.length; i++) {
            var data = _dataList[i];
            buffer.put(data.getMode(), 4);
            buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber2));
            data.write(buffer);
          }
          var totalDataCount = 0;
          for (var i = 0; i < rsBlocks.length; i++) {
            totalDataCount += rsBlocks[i].dataCount;
          }
          if (buffer.getLengthInBits() <= totalDataCount * 8) {
            break;
          }
        }
        _typeNumber = typeNumber2;
      }
      makeImpl(false, getBestMaskPattern());
    };
    _this.createTableTag = function(cellSize, margin) {
      cellSize = cellSize || 2;
      margin = typeof margin == "undefined" ? cellSize * 4 : margin;
      var qrHtml = "";
      qrHtml += '<table style="';
      qrHtml += " border-width: 0px; border-style: none;";
      qrHtml += " border-collapse: collapse;";
      qrHtml += " padding: 0px; margin: " + margin + "px;";
      qrHtml += '">';
      qrHtml += "<tbody>";
      for (var r = 0; r < _this.getModuleCount(); r += 1) {
        qrHtml += "<tr>";
        for (var c = 0; c < _this.getModuleCount(); c += 1) {
          qrHtml += '<td style="';
          qrHtml += " border-width: 0px; border-style: none;";
          qrHtml += " border-collapse: collapse;";
          qrHtml += " padding: 0px; margin: 0px;";
          qrHtml += " width: " + cellSize + "px;";
          qrHtml += " height: " + cellSize + "px;";
          qrHtml += " background-color: ";
          qrHtml += _this.isDark(r, c) ? "#000000" : "#ffffff";
          qrHtml += ";";
          qrHtml += '"/>';
        }
        qrHtml += "</tr>";
      }
      qrHtml += "</tbody>";
      qrHtml += "</table>";
      return qrHtml;
    };
    _this.createSvgTag = function(cellSize, margin, alt, title) {
      var opts = {};
      if (typeof arguments[0] == "object") {
        opts = arguments[0];
        cellSize = opts.cellSize;
        margin = opts.margin;
        alt = opts.alt;
        title = opts.title;
      }
      cellSize = cellSize || 2;
      margin = typeof margin == "undefined" ? cellSize * 4 : margin;
      alt = typeof alt === "string" ? { text: alt } : alt || {};
      alt.text = alt.text || null;
      alt.id = alt.text ? alt.id || "qrcode-description" : null;
      title = typeof title === "string" ? { text: title } : title || {};
      title.text = title.text || null;
      title.id = title.text ? title.id || "qrcode-title" : null;
      var size = _this.getModuleCount() * cellSize + margin * 2;
      var c, mc, r, mr, qrSvg = "", rect;
      rect = "l" + cellSize + ",0 0," + cellSize + " -" + cellSize + ",0 0,-" + cellSize + "z ";
      qrSvg += '<svg version="1.1" xmlns="http://www.w3.org/2000/svg"';
      qrSvg += !opts.scalable ? ' width="' + size + 'px" height="' + size + 'px"' : "";
      qrSvg += ' viewBox="0 0 ' + size + " " + size + '" ';
      qrSvg += ' preserveAspectRatio="xMinYMin meet"';
      qrSvg += title.text || alt.text ? ' role="img" aria-labelledby="' + escapeXml([title.id, alt.id].join(" ").trim()) + '"' : "";
      qrSvg += ">";
      qrSvg += title.text ? '<title id="' + escapeXml(title.id) + '">' + escapeXml(title.text) + "</title>" : "";
      qrSvg += alt.text ? '<description id="' + escapeXml(alt.id) + '">' + escapeXml(alt.text) + "</description>" : "";
      qrSvg += '<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>';
      qrSvg += '<path d="';
      for (r = 0; r < _this.getModuleCount(); r += 1) {
        mr = r * cellSize + margin;
        for (c = 0; c < _this.getModuleCount(); c += 1) {
          if (_this.isDark(r, c)) {
            mc = c * cellSize + margin;
            qrSvg += "M" + mc + "," + mr + rect;
          }
        }
      }
      qrSvg += '" stroke="transparent" fill="black"/>';
      qrSvg += "</svg>";
      return qrSvg;
    };
    _this.createDataURL = function(cellSize, margin) {
      cellSize = cellSize || 2;
      margin = typeof margin == "undefined" ? cellSize * 4 : margin;
      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;
      return createDataURL(size, size, function(x, y) {
        if (min <= x && x < max && min <= y && y < max) {
          var c = Math.floor((x - min) / cellSize);
          var r = Math.floor((y - min) / cellSize);
          return _this.isDark(r, c) ? 0 : 1;
        } else {
          return 1;
        }
      });
    };
    _this.createImgTag = function(cellSize, margin, alt) {
      cellSize = cellSize || 2;
      margin = typeof margin == "undefined" ? cellSize * 4 : margin;
      var size = _this.getModuleCount() * cellSize + margin * 2;
      var img = "";
      img += "<img";
      img += ' src="';
      img += _this.createDataURL(cellSize, margin);
      img += '"';
      img += ' width="';
      img += size;
      img += '"';
      img += ' height="';
      img += size;
      img += '"';
      if (alt) {
        img += ' alt="';
        img += escapeXml(alt);
        img += '"';
      }
      img += "/>";
      return img;
    };
    var escapeXml = function(s) {
      var escaped = "";
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charAt(i);
        switch (c) {
          case "<":
            escaped += "&lt;";
            break;
          case ">":
            escaped += "&gt;";
            break;
          case "&":
            escaped += "&amp;";
            break;
          case '"':
            escaped += "&quot;";
            break;
          default:
            escaped += c;
            break;
        }
      }
      return escaped;
    };
    var _createHalfASCII = function(margin) {
      var cellSize = 1;
      margin = typeof margin == "undefined" ? cellSize * 2 : margin;
      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;
      var y, x, r1, r2, p2;
      var blocks = {
        "\u2588\u2588": "\u2588",
        "\u2588 ": "\u2580",
        " \u2588": "\u2584",
        "  ": " "
      };
      var blocksLastLineNoMargin = {
        "\u2588\u2588": "\u2580",
        "\u2588 ": "\u2580",
        " \u2588": " ",
        "  ": " "
      };
      var ascii = "";
      for (y = 0; y < size; y += 2) {
        r1 = Math.floor((y - min) / cellSize);
        r2 = Math.floor((y + 1 - min) / cellSize);
        for (x = 0; x < size; x += 1) {
          p2 = "\u2588";
          if (min <= x && x < max && min <= y && y < max && _this.isDark(r1, Math.floor((x - min) / cellSize))) {
            p2 = " ";
          }
          if (min <= x && x < max && min <= y + 1 && y + 1 < max && _this.isDark(r2, Math.floor((x - min) / cellSize))) {
            p2 += " ";
          } else {
            p2 += "\u2588";
          }
          ascii += margin < 1 && y + 1 >= max ? blocksLastLineNoMargin[p2] : blocks[p2];
        }
        ascii += "\n";
      }
      if (size % 2 && margin > 0) {
        return ascii.substring(0, ascii.length - size - 1) + Array(size + 1).join("\u2580");
      }
      return ascii.substring(0, ascii.length - 1);
    };
    _this.createASCII = function(cellSize, margin) {
      cellSize = cellSize || 1;
      if (cellSize < 2) {
        return _createHalfASCII(margin);
      }
      cellSize -= 1;
      margin = typeof margin == "undefined" ? cellSize * 2 : margin;
      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;
      var y, x, r, p2;
      var white = Array(cellSize + 1).join("\u2588\u2588");
      var black = Array(cellSize + 1).join("  ");
      var ascii = "";
      var line = "";
      for (y = 0; y < size; y += 1) {
        r = Math.floor((y - min) / cellSize);
        line = "";
        for (x = 0; x < size; x += 1) {
          p2 = 1;
          if (min <= x && x < max && min <= y && y < max && _this.isDark(r, Math.floor((x - min) / cellSize))) {
            p2 = 0;
          }
          line += p2 ? white : black;
        }
        for (r = 0; r < cellSize; r += 1) {
          ascii += line + "\n";
        }
      }
      return ascii.substring(0, ascii.length - 1);
    };
    _this.renderTo2dContext = function(context, cellSize) {
      cellSize = cellSize || 2;
      var length = _this.getModuleCount();
      for (var row = 0; row < length; row++) {
        for (var col = 0; col < length; col++) {
          context.fillStyle = _this.isDark(row, col) ? "black" : "white";
          context.fillRect(row * cellSize, col * cellSize, cellSize, cellSize);
        }
      }
    };
    return _this;
  };
  qrcode2.stringToBytesFuncs = {
    "default": function(s) {
      var bytes = [];
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charCodeAt(i);
        bytes.push(c & 255);
      }
      return bytes;
    }
  };
  qrcode2.stringToBytes = qrcode2.stringToBytesFuncs["default"];
  qrcode2.createStringToBytes = function(unicodeData, numChars) {
    var unicodeMap = function() {
      var bin = base64DecodeInputStream(unicodeData);
      var read = function() {
        var b = bin.read();
        if (b == -1) throw "eof";
        return b;
      };
      var count = 0;
      var unicodeMap2 = {};
      while (true) {
        var b0 = bin.read();
        if (b0 == -1) break;
        var b1 = read();
        var b2 = read();
        var b3 = read();
        var k = String.fromCharCode(b0 << 8 | b1);
        var v = b2 << 8 | b3;
        unicodeMap2[k] = v;
        count += 1;
      }
      if (count != numChars) {
        throw count + " != " + numChars;
      }
      return unicodeMap2;
    }();
    var unknownChar = "?".charCodeAt(0);
    return function(s) {
      var bytes = [];
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charCodeAt(i);
        if (c < 128) {
          bytes.push(c);
        } else {
          var b = unicodeMap[s.charAt(i)];
          if (typeof b == "number") {
            if ((b & 255) == b) {
              bytes.push(b);
            } else {
              bytes.push(b >>> 8);
              bytes.push(b & 255);
            }
          } else {
            bytes.push(unknownChar);
          }
        }
      }
      return bytes;
    };
  };
  var QRMode = {
    MODE_NUMBER: 1 << 0,
    MODE_ALPHA_NUM: 1 << 1,
    MODE_8BIT_BYTE: 1 << 2,
    MODE_KANJI: 1 << 3
  };
  var QRErrorCorrectionLevel = {
    L: 1,
    M: 0,
    Q: 3,
    H: 2
  };
  var QRMaskPattern = {
    PATTERN000: 0,
    PATTERN001: 1,
    PATTERN010: 2,
    PATTERN011: 3,
    PATTERN100: 4,
    PATTERN101: 5,
    PATTERN110: 6,
    PATTERN111: 7
  };
  var QRUtil = function() {
    var PATTERN_POSITION_TABLE = [
      [],
      [6, 18],
      [6, 22],
      [6, 26],
      [6, 30],
      [6, 34],
      [6, 22, 38],
      [6, 24, 42],
      [6, 26, 46],
      [6, 28, 50],
      [6, 30, 54],
      [6, 32, 58],
      [6, 34, 62],
      [6, 26, 46, 66],
      [6, 26, 48, 70],
      [6, 26, 50, 74],
      [6, 30, 54, 78],
      [6, 30, 56, 82],
      [6, 30, 58, 86],
      [6, 34, 62, 90],
      [6, 28, 50, 72, 94],
      [6, 26, 50, 74, 98],
      [6, 30, 54, 78, 102],
      [6, 28, 54, 80, 106],
      [6, 32, 58, 84, 110],
      [6, 30, 58, 86, 114],
      [6, 34, 62, 90, 118],
      [6, 26, 50, 74, 98, 122],
      [6, 30, 54, 78, 102, 126],
      [6, 26, 52, 78, 104, 130],
      [6, 30, 56, 82, 108, 134],
      [6, 34, 60, 86, 112, 138],
      [6, 30, 58, 86, 114, 142],
      [6, 34, 62, 90, 118, 146],
      [6, 30, 54, 78, 102, 126, 150],
      [6, 24, 50, 76, 102, 128, 154],
      [6, 28, 54, 80, 106, 132, 158],
      [6, 32, 58, 84, 110, 136, 162],
      [6, 26, 54, 82, 110, 138, 166],
      [6, 30, 58, 86, 114, 142, 170]
    ];
    var G15 = 1 << 10 | 1 << 8 | 1 << 5 | 1 << 4 | 1 << 2 | 1 << 1 | 1 << 0;
    var G18 = 1 << 12 | 1 << 11 | 1 << 10 | 1 << 9 | 1 << 8 | 1 << 5 | 1 << 2 | 1 << 0;
    var G15_MASK = 1 << 14 | 1 << 12 | 1 << 10 | 1 << 4 | 1 << 1;
    var _this = {};
    var getBCHDigit = function(data) {
      var digit = 0;
      while (data != 0) {
        digit += 1;
        data >>>= 1;
      }
      return digit;
    };
    _this.getBCHTypeInfo = function(data) {
      var d = data << 10;
      while (getBCHDigit(d) - getBCHDigit(G15) >= 0) {
        d ^= G15 << getBCHDigit(d) - getBCHDigit(G15);
      }
      return (data << 10 | d) ^ G15_MASK;
    };
    _this.getBCHTypeNumber = function(data) {
      var d = data << 12;
      while (getBCHDigit(d) - getBCHDigit(G18) >= 0) {
        d ^= G18 << getBCHDigit(d) - getBCHDigit(G18);
      }
      return data << 12 | d;
    };
    _this.getPatternPosition = function(typeNumber) {
      return PATTERN_POSITION_TABLE[typeNumber - 1];
    };
    _this.getMaskFunction = function(maskPattern) {
      switch (maskPattern) {
        case QRMaskPattern.PATTERN000:
          return function(i, j) {
            return (i + j) % 2 == 0;
          };
        case QRMaskPattern.PATTERN001:
          return function(i, j) {
            return i % 2 == 0;
          };
        case QRMaskPattern.PATTERN010:
          return function(i, j) {
            return j % 3 == 0;
          };
        case QRMaskPattern.PATTERN011:
          return function(i, j) {
            return (i + j) % 3 == 0;
          };
        case QRMaskPattern.PATTERN100:
          return function(i, j) {
            return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 == 0;
          };
        case QRMaskPattern.PATTERN101:
          return function(i, j) {
            return i * j % 2 + i * j % 3 == 0;
          };
        case QRMaskPattern.PATTERN110:
          return function(i, j) {
            return (i * j % 2 + i * j % 3) % 2 == 0;
          };
        case QRMaskPattern.PATTERN111:
          return function(i, j) {
            return (i * j % 3 + (i + j) % 2) % 2 == 0;
          };
        default:
          throw "bad maskPattern:" + maskPattern;
      }
    };
    _this.getErrorCorrectPolynomial = function(errorCorrectLength) {
      var a = qrPolynomial([1], 0);
      for (var i = 0; i < errorCorrectLength; i += 1) {
        a = a.multiply(qrPolynomial([1, QRMath.gexp(i)], 0));
      }
      return a;
    };
    _this.getLengthInBits = function(mode, type) {
      if (1 <= type && type < 10) {
        switch (mode) {
          case QRMode.MODE_NUMBER:
            return 10;
          case QRMode.MODE_ALPHA_NUM:
            return 9;
          case QRMode.MODE_8BIT_BYTE:
            return 8;
          case QRMode.MODE_KANJI:
            return 8;
          default:
            throw "mode:" + mode;
        }
      } else if (type < 27) {
        switch (mode) {
          case QRMode.MODE_NUMBER:
            return 12;
          case QRMode.MODE_ALPHA_NUM:
            return 11;
          case QRMode.MODE_8BIT_BYTE:
            return 16;
          case QRMode.MODE_KANJI:
            return 10;
          default:
            throw "mode:" + mode;
        }
      } else if (type < 41) {
        switch (mode) {
          case QRMode.MODE_NUMBER:
            return 14;
          case QRMode.MODE_ALPHA_NUM:
            return 13;
          case QRMode.MODE_8BIT_BYTE:
            return 16;
          case QRMode.MODE_KANJI:
            return 12;
          default:
            throw "mode:" + mode;
        }
      } else {
        throw "type:" + type;
      }
    };
    _this.getLostPoint = function(qrcode3) {
      var moduleCount = qrcode3.getModuleCount();
      var lostPoint = 0;
      for (var row = 0; row < moduleCount; row += 1) {
        for (var col = 0; col < moduleCount; col += 1) {
          var sameCount = 0;
          var dark = qrcode3.isDark(row, col);
          for (var r = -1; r <= 1; r += 1) {
            if (row + r < 0 || moduleCount <= row + r) {
              continue;
            }
            for (var c = -1; c <= 1; c += 1) {
              if (col + c < 0 || moduleCount <= col + c) {
                continue;
              }
              if (r == 0 && c == 0) {
                continue;
              }
              if (dark == qrcode3.isDark(row + r, col + c)) {
                sameCount += 1;
              }
            }
          }
          if (sameCount > 5) {
            lostPoint += 3 + sameCount - 5;
          }
        }
      }
      ;
      for (var row = 0; row < moduleCount - 1; row += 1) {
        for (var col = 0; col < moduleCount - 1; col += 1) {
          var count = 0;
          if (qrcode3.isDark(row, col)) count += 1;
          if (qrcode3.isDark(row + 1, col)) count += 1;
          if (qrcode3.isDark(row, col + 1)) count += 1;
          if (qrcode3.isDark(row + 1, col + 1)) count += 1;
          if (count == 0 || count == 4) {
            lostPoint += 3;
          }
        }
      }
      for (var row = 0; row < moduleCount; row += 1) {
        for (var col = 0; col < moduleCount - 6; col += 1) {
          if (qrcode3.isDark(row, col) && !qrcode3.isDark(row, col + 1) && qrcode3.isDark(row, col + 2) && qrcode3.isDark(row, col + 3) && qrcode3.isDark(row, col + 4) && !qrcode3.isDark(row, col + 5) && qrcode3.isDark(row, col + 6)) {
            lostPoint += 40;
          }
        }
      }
      for (var col = 0; col < moduleCount; col += 1) {
        for (var row = 0; row < moduleCount - 6; row += 1) {
          if (qrcode3.isDark(row, col) && !qrcode3.isDark(row + 1, col) && qrcode3.isDark(row + 2, col) && qrcode3.isDark(row + 3, col) && qrcode3.isDark(row + 4, col) && !qrcode3.isDark(row + 5, col) && qrcode3.isDark(row + 6, col)) {
            lostPoint += 40;
          }
        }
      }
      var darkCount = 0;
      for (var col = 0; col < moduleCount; col += 1) {
        for (var row = 0; row < moduleCount; row += 1) {
          if (qrcode3.isDark(row, col)) {
            darkCount += 1;
          }
        }
      }
      var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
      lostPoint += ratio * 10;
      return lostPoint;
    };
    return _this;
  }();
  var QRMath = function() {
    var EXP_TABLE = new Array(256);
    var LOG_TABLE = new Array(256);
    for (var i = 0; i < 8; i += 1) {
      EXP_TABLE[i] = 1 << i;
    }
    for (var i = 8; i < 256; i += 1) {
      EXP_TABLE[i] = EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8];
    }
    for (var i = 0; i < 255; i += 1) {
      LOG_TABLE[EXP_TABLE[i]] = i;
    }
    var _this = {};
    _this.glog = function(n) {
      if (n < 1) {
        throw "glog(" + n + ")";
      }
      return LOG_TABLE[n];
    };
    _this.gexp = function(n) {
      while (n < 0) {
        n += 255;
      }
      while (n >= 256) {
        n -= 255;
      }
      return EXP_TABLE[n];
    };
    return _this;
  }();
  function qrPolynomial(num, shift) {
    if (typeof num.length == "undefined") {
      throw num.length + "/" + shift;
    }
    var _num = function() {
      var offset = 0;
      while (offset < num.length && num[offset] == 0) {
        offset += 1;
      }
      var _num2 = new Array(num.length - offset + shift);
      for (var i = 0; i < num.length - offset; i += 1) {
        _num2[i] = num[i + offset];
      }
      return _num2;
    }();
    var _this = {};
    _this.getAt = function(index) {
      return _num[index];
    };
    _this.getLength = function() {
      return _num.length;
    };
    _this.multiply = function(e) {
      var num2 = new Array(_this.getLength() + e.getLength() - 1);
      for (var i = 0; i < _this.getLength(); i += 1) {
        for (var j = 0; j < e.getLength(); j += 1) {
          num2[i + j] ^= QRMath.gexp(QRMath.glog(_this.getAt(i)) + QRMath.glog(e.getAt(j)));
        }
      }
      return qrPolynomial(num2, 0);
    };
    _this.mod = function(e) {
      if (_this.getLength() - e.getLength() < 0) {
        return _this;
      }
      var ratio = QRMath.glog(_this.getAt(0)) - QRMath.glog(e.getAt(0));
      var num2 = new Array(_this.getLength());
      for (var i = 0; i < _this.getLength(); i += 1) {
        num2[i] = _this.getAt(i);
      }
      for (var i = 0; i < e.getLength(); i += 1) {
        num2[i] ^= QRMath.gexp(QRMath.glog(e.getAt(i)) + ratio);
      }
      return qrPolynomial(num2, 0).mod(e);
    };
    return _this;
  }
  ;
  var QRRSBlock = function() {
    var RS_BLOCK_TABLE = [
      // L
      // M
      // Q
      // H
      // 1
      [1, 26, 19],
      [1, 26, 16],
      [1, 26, 13],
      [1, 26, 9],
      // 2
      [1, 44, 34],
      [1, 44, 28],
      [1, 44, 22],
      [1, 44, 16],
      // 3
      [1, 70, 55],
      [1, 70, 44],
      [2, 35, 17],
      [2, 35, 13],
      // 4
      [1, 100, 80],
      [2, 50, 32],
      [2, 50, 24],
      [4, 25, 9],
      // 5
      [1, 134, 108],
      [2, 67, 43],
      [2, 33, 15, 2, 34, 16],
      [2, 33, 11, 2, 34, 12],
      // 6
      [2, 86, 68],
      [4, 43, 27],
      [4, 43, 19],
      [4, 43, 15],
      // 7
      [2, 98, 78],
      [4, 49, 31],
      [2, 32, 14, 4, 33, 15],
      [4, 39, 13, 1, 40, 14],
      // 8
      [2, 121, 97],
      [2, 60, 38, 2, 61, 39],
      [4, 40, 18, 2, 41, 19],
      [4, 40, 14, 2, 41, 15],
      // 9
      [2, 146, 116],
      [3, 58, 36, 2, 59, 37],
      [4, 36, 16, 4, 37, 17],
      [4, 36, 12, 4, 37, 13],
      // 10
      [2, 86, 68, 2, 87, 69],
      [4, 69, 43, 1, 70, 44],
      [6, 43, 19, 2, 44, 20],
      [6, 43, 15, 2, 44, 16],
      // 11
      [4, 101, 81],
      [1, 80, 50, 4, 81, 51],
      [4, 50, 22, 4, 51, 23],
      [3, 36, 12, 8, 37, 13],
      // 12
      [2, 116, 92, 2, 117, 93],
      [6, 58, 36, 2, 59, 37],
      [4, 46, 20, 6, 47, 21],
      [7, 42, 14, 4, 43, 15],
      // 13
      [4, 133, 107],
      [8, 59, 37, 1, 60, 38],
      [8, 44, 20, 4, 45, 21],
      [12, 33, 11, 4, 34, 12],
      // 14
      [3, 145, 115, 1, 146, 116],
      [4, 64, 40, 5, 65, 41],
      [11, 36, 16, 5, 37, 17],
      [11, 36, 12, 5, 37, 13],
      // 15
      [5, 109, 87, 1, 110, 88],
      [5, 65, 41, 5, 66, 42],
      [5, 54, 24, 7, 55, 25],
      [11, 36, 12, 7, 37, 13],
      // 16
      [5, 122, 98, 1, 123, 99],
      [7, 73, 45, 3, 74, 46],
      [15, 43, 19, 2, 44, 20],
      [3, 45, 15, 13, 46, 16],
      // 17
      [1, 135, 107, 5, 136, 108],
      [10, 74, 46, 1, 75, 47],
      [1, 50, 22, 15, 51, 23],
      [2, 42, 14, 17, 43, 15],
      // 18
      [5, 150, 120, 1, 151, 121],
      [9, 69, 43, 4, 70, 44],
      [17, 50, 22, 1, 51, 23],
      [2, 42, 14, 19, 43, 15],
      // 19
      [3, 141, 113, 4, 142, 114],
      [3, 70, 44, 11, 71, 45],
      [17, 47, 21, 4, 48, 22],
      [9, 39, 13, 16, 40, 14],
      // 20
      [3, 135, 107, 5, 136, 108],
      [3, 67, 41, 13, 68, 42],
      [15, 54, 24, 5, 55, 25],
      [15, 43, 15, 10, 44, 16],
      // 21
      [4, 144, 116, 4, 145, 117],
      [17, 68, 42],
      [17, 50, 22, 6, 51, 23],
      [19, 46, 16, 6, 47, 17],
      // 22
      [2, 139, 111, 7, 140, 112],
      [17, 74, 46],
      [7, 54, 24, 16, 55, 25],
      [34, 37, 13],
      // 23
      [4, 151, 121, 5, 152, 122],
      [4, 75, 47, 14, 76, 48],
      [11, 54, 24, 14, 55, 25],
      [16, 45, 15, 14, 46, 16],
      // 24
      [6, 147, 117, 4, 148, 118],
      [6, 73, 45, 14, 74, 46],
      [11, 54, 24, 16, 55, 25],
      [30, 46, 16, 2, 47, 17],
      // 25
      [8, 132, 106, 4, 133, 107],
      [8, 75, 47, 13, 76, 48],
      [7, 54, 24, 22, 55, 25],
      [22, 45, 15, 13, 46, 16],
      // 26
      [10, 142, 114, 2, 143, 115],
      [19, 74, 46, 4, 75, 47],
      [28, 50, 22, 6, 51, 23],
      [33, 46, 16, 4, 47, 17],
      // 27
      [8, 152, 122, 4, 153, 123],
      [22, 73, 45, 3, 74, 46],
      [8, 53, 23, 26, 54, 24],
      [12, 45, 15, 28, 46, 16],
      // 28
      [3, 147, 117, 10, 148, 118],
      [3, 73, 45, 23, 74, 46],
      [4, 54, 24, 31, 55, 25],
      [11, 45, 15, 31, 46, 16],
      // 29
      [7, 146, 116, 7, 147, 117],
      [21, 73, 45, 7, 74, 46],
      [1, 53, 23, 37, 54, 24],
      [19, 45, 15, 26, 46, 16],
      // 30
      [5, 145, 115, 10, 146, 116],
      [19, 75, 47, 10, 76, 48],
      [15, 54, 24, 25, 55, 25],
      [23, 45, 15, 25, 46, 16],
      // 31
      [13, 145, 115, 3, 146, 116],
      [2, 74, 46, 29, 75, 47],
      [42, 54, 24, 1, 55, 25],
      [23, 45, 15, 28, 46, 16],
      // 32
      [17, 145, 115],
      [10, 74, 46, 23, 75, 47],
      [10, 54, 24, 35, 55, 25],
      [19, 45, 15, 35, 46, 16],
      // 33
      [17, 145, 115, 1, 146, 116],
      [14, 74, 46, 21, 75, 47],
      [29, 54, 24, 19, 55, 25],
      [11, 45, 15, 46, 46, 16],
      // 34
      [13, 145, 115, 6, 146, 116],
      [14, 74, 46, 23, 75, 47],
      [44, 54, 24, 7, 55, 25],
      [59, 46, 16, 1, 47, 17],
      // 35
      [12, 151, 121, 7, 152, 122],
      [12, 75, 47, 26, 76, 48],
      [39, 54, 24, 14, 55, 25],
      [22, 45, 15, 41, 46, 16],
      // 36
      [6, 151, 121, 14, 152, 122],
      [6, 75, 47, 34, 76, 48],
      [46, 54, 24, 10, 55, 25],
      [2, 45, 15, 64, 46, 16],
      // 37
      [17, 152, 122, 4, 153, 123],
      [29, 74, 46, 14, 75, 47],
      [49, 54, 24, 10, 55, 25],
      [24, 45, 15, 46, 46, 16],
      // 38
      [4, 152, 122, 18, 153, 123],
      [13, 74, 46, 32, 75, 47],
      [48, 54, 24, 14, 55, 25],
      [42, 45, 15, 32, 46, 16],
      // 39
      [20, 147, 117, 4, 148, 118],
      [40, 75, 47, 7, 76, 48],
      [43, 54, 24, 22, 55, 25],
      [10, 45, 15, 67, 46, 16],
      // 40
      [19, 148, 118, 6, 149, 119],
      [18, 75, 47, 31, 76, 48],
      [34, 54, 24, 34, 55, 25],
      [20, 45, 15, 61, 46, 16]
    ];
    var qrRSBlock = function(totalCount, dataCount) {
      var _this2 = {};
      _this2.totalCount = totalCount;
      _this2.dataCount = dataCount;
      return _this2;
    };
    var _this = {};
    var getRsBlockTable = function(typeNumber, errorCorrectionLevel) {
      switch (errorCorrectionLevel) {
        case QRErrorCorrectionLevel.L:
          return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
        case QRErrorCorrectionLevel.M:
          return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
        case QRErrorCorrectionLevel.Q:
          return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
        case QRErrorCorrectionLevel.H:
          return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
        default:
          return void 0;
      }
    };
    _this.getRSBlocks = function(typeNumber, errorCorrectionLevel) {
      var rsBlock = getRsBlockTable(typeNumber, errorCorrectionLevel);
      if (typeof rsBlock == "undefined") {
        throw "bad rs block @ typeNumber:" + typeNumber + "/errorCorrectionLevel:" + errorCorrectionLevel;
      }
      var length = rsBlock.length / 3;
      var list = [];
      for (var i = 0; i < length; i += 1) {
        var count = rsBlock[i * 3 + 0];
        var totalCount = rsBlock[i * 3 + 1];
        var dataCount = rsBlock[i * 3 + 2];
        for (var j = 0; j < count; j += 1) {
          list.push(qrRSBlock(totalCount, dataCount));
        }
      }
      return list;
    };
    return _this;
  }();
  var qrBitBuffer = function() {
    var _buffer = [];
    var _length = 0;
    var _this = {};
    _this.getBuffer = function() {
      return _buffer;
    };
    _this.getAt = function(index) {
      var bufIndex = Math.floor(index / 8);
      return (_buffer[bufIndex] >>> 7 - index % 8 & 1) == 1;
    };
    _this.put = function(num, length) {
      for (var i = 0; i < length; i += 1) {
        _this.putBit((num >>> length - i - 1 & 1) == 1);
      }
    };
    _this.getLengthInBits = function() {
      return _length;
    };
    _this.putBit = function(bit) {
      var bufIndex = Math.floor(_length / 8);
      if (_buffer.length <= bufIndex) {
        _buffer.push(0);
      }
      if (bit) {
        _buffer[bufIndex] |= 128 >>> _length % 8;
      }
      _length += 1;
    };
    return _this;
  };
  var qrNumber = function(data) {
    var _mode = QRMode.MODE_NUMBER;
    var _data = data;
    var _this = {};
    _this.getMode = function() {
      return _mode;
    };
    _this.getLength = function(buffer) {
      return _data.length;
    };
    _this.write = function(buffer) {
      var data2 = _data;
      var i = 0;
      while (i + 2 < data2.length) {
        buffer.put(strToNum(data2.substring(i, i + 3)), 10);
        i += 3;
      }
      if (i < data2.length) {
        if (data2.length - i == 1) {
          buffer.put(strToNum(data2.substring(i, i + 1)), 4);
        } else if (data2.length - i == 2) {
          buffer.put(strToNum(data2.substring(i, i + 2)), 7);
        }
      }
    };
    var strToNum = function(s) {
      var num = 0;
      for (var i = 0; i < s.length; i += 1) {
        num = num * 10 + chatToNum(s.charAt(i));
      }
      return num;
    };
    var chatToNum = function(c) {
      if ("0" <= c && c <= "9") {
        return c.charCodeAt(0) - "0".charCodeAt(0);
      }
      throw "illegal char :" + c;
    };
    return _this;
  };
  var qrAlphaNum = function(data) {
    var _mode = QRMode.MODE_ALPHA_NUM;
    var _data = data;
    var _this = {};
    _this.getMode = function() {
      return _mode;
    };
    _this.getLength = function(buffer) {
      return _data.length;
    };
    _this.write = function(buffer) {
      var s = _data;
      var i = 0;
      while (i + 1 < s.length) {
        buffer.put(
          getCode(s.charAt(i)) * 45 + getCode(s.charAt(i + 1)),
          11
        );
        i += 2;
      }
      if (i < s.length) {
        buffer.put(getCode(s.charAt(i)), 6);
      }
    };
    var getCode = function(c) {
      if ("0" <= c && c <= "9") {
        return c.charCodeAt(0) - "0".charCodeAt(0);
      } else if ("A" <= c && c <= "Z") {
        return c.charCodeAt(0) - "A".charCodeAt(0) + 10;
      } else {
        switch (c) {
          case " ":
            return 36;
          case "$":
            return 37;
          case "%":
            return 38;
          case "*":
            return 39;
          case "+":
            return 40;
          case "-":
            return 41;
          case ".":
            return 42;
          case "/":
            return 43;
          case ":":
            return 44;
          default:
            throw "illegal char :" + c;
        }
      }
    };
    return _this;
  };
  var qr8BitByte = function(data) {
    var _mode = QRMode.MODE_8BIT_BYTE;
    var _data = data;
    var _bytes = qrcode2.stringToBytes(data);
    var _this = {};
    _this.getMode = function() {
      return _mode;
    };
    _this.getLength = function(buffer) {
      return _bytes.length;
    };
    _this.write = function(buffer) {
      for (var i = 0; i < _bytes.length; i += 1) {
        buffer.put(_bytes[i], 8);
      }
    };
    return _this;
  };
  var qrKanji = function(data) {
    var _mode = QRMode.MODE_KANJI;
    var _data = data;
    var stringToBytes = qrcode2.stringToBytesFuncs["SJIS"];
    if (!stringToBytes) {
      throw "sjis not supported.";
    }
    !function(c, code) {
      var test = stringToBytes(c);
      if (test.length != 2 || (test[0] << 8 | test[1]) != code) {
        throw "sjis not supported.";
      }
    }("\u53CB", 38726);
    var _bytes = stringToBytes(data);
    var _this = {};
    _this.getMode = function() {
      return _mode;
    };
    _this.getLength = function(buffer) {
      return ~~(_bytes.length / 2);
    };
    _this.write = function(buffer) {
      var data2 = _bytes;
      var i = 0;
      while (i + 1 < data2.length) {
        var c = (255 & data2[i]) << 8 | 255 & data2[i + 1];
        if (33088 <= c && c <= 40956) {
          c -= 33088;
        } else if (57408 <= c && c <= 60351) {
          c -= 49472;
        } else {
          throw "illegal char at " + (i + 1) + "/" + c;
        }
        c = (c >>> 8 & 255) * 192 + (c & 255);
        buffer.put(c, 13);
        i += 2;
      }
      if (i < data2.length) {
        throw "illegal char at " + (i + 1);
      }
    };
    return _this;
  };
  var byteArrayOutputStream = function() {
    var _bytes = [];
    var _this = {};
    _this.writeByte = function(b) {
      _bytes.push(b & 255);
    };
    _this.writeShort = function(i) {
      _this.writeByte(i);
      _this.writeByte(i >>> 8);
    };
    _this.writeBytes = function(b, off, len) {
      off = off || 0;
      len = len || b.length;
      for (var i = 0; i < len; i += 1) {
        _this.writeByte(b[i + off]);
      }
    };
    _this.writeString = function(s) {
      for (var i = 0; i < s.length; i += 1) {
        _this.writeByte(s.charCodeAt(i));
      }
    };
    _this.toByteArray = function() {
      return _bytes;
    };
    _this.toString = function() {
      var s = "";
      s += "[";
      for (var i = 0; i < _bytes.length; i += 1) {
        if (i > 0) {
          s += ",";
        }
        s += _bytes[i];
      }
      s += "]";
      return s;
    };
    return _this;
  };
  var base64EncodeOutputStream = function() {
    var _buffer = 0;
    var _buflen = 0;
    var _length = 0;
    var _base64 = "";
    var _this = {};
    var writeEncoded = function(b) {
      _base64 += String.fromCharCode(encode(b & 63));
    };
    var encode = function(n) {
      if (n < 0) {
      } else if (n < 26) {
        return 65 + n;
      } else if (n < 52) {
        return 97 + (n - 26);
      } else if (n < 62) {
        return 48 + (n - 52);
      } else if (n == 62) {
        return 43;
      } else if (n == 63) {
        return 47;
      }
      throw "n:" + n;
    };
    _this.writeByte = function(n) {
      _buffer = _buffer << 8 | n & 255;
      _buflen += 8;
      _length += 1;
      while (_buflen >= 6) {
        writeEncoded(_buffer >>> _buflen - 6);
        _buflen -= 6;
      }
    };
    _this.flush = function() {
      if (_buflen > 0) {
        writeEncoded(_buffer << 6 - _buflen);
        _buffer = 0;
        _buflen = 0;
      }
      if (_length % 3 != 0) {
        var padlen = 3 - _length % 3;
        for (var i = 0; i < padlen; i += 1) {
          _base64 += "=";
        }
      }
    };
    _this.toString = function() {
      return _base64;
    };
    return _this;
  };
  var base64DecodeInputStream = function(str) {
    var _str = str;
    var _pos = 0;
    var _buffer = 0;
    var _buflen = 0;
    var _this = {};
    _this.read = function() {
      while (_buflen < 8) {
        if (_pos >= _str.length) {
          if (_buflen == 0) {
            return -1;
          }
          throw "unexpected end of file./" + _buflen;
        }
        var c = _str.charAt(_pos);
        _pos += 1;
        if (c == "=") {
          _buflen = 0;
          return -1;
        } else if (c.match(/^\s$/)) {
          continue;
        }
        _buffer = _buffer << 6 | decode(c.charCodeAt(0));
        _buflen += 6;
      }
      var n = _buffer >>> _buflen - 8 & 255;
      _buflen -= 8;
      return n;
    };
    var decode = function(c) {
      if (65 <= c && c <= 90) {
        return c - 65;
      } else if (97 <= c && c <= 122) {
        return c - 97 + 26;
      } else if (48 <= c && c <= 57) {
        return c - 48 + 52;
      } else if (c == 43) {
        return 62;
      } else if (c == 47) {
        return 63;
      } else {
        throw "c:" + c;
      }
    };
    return _this;
  };
  var gifImage = function(width, height) {
    var _width = width;
    var _height = height;
    var _data = new Array(width * height);
    var _this = {};
    _this.setPixel = function(x, y, pixel) {
      _data[y * _width + x] = pixel;
    };
    _this.write = function(out) {
      out.writeString("GIF87a");
      out.writeShort(_width);
      out.writeShort(_height);
      out.writeByte(128);
      out.writeByte(0);
      out.writeByte(0);
      out.writeByte(0);
      out.writeByte(0);
      out.writeByte(0);
      out.writeByte(255);
      out.writeByte(255);
      out.writeByte(255);
      out.writeString(",");
      out.writeShort(0);
      out.writeShort(0);
      out.writeShort(_width);
      out.writeShort(_height);
      out.writeByte(0);
      var lzwMinCodeSize = 2;
      var raster = getLZWRaster(lzwMinCodeSize);
      out.writeByte(lzwMinCodeSize);
      var offset = 0;
      while (raster.length - offset > 255) {
        out.writeByte(255);
        out.writeBytes(raster, offset, 255);
        offset += 255;
      }
      out.writeByte(raster.length - offset);
      out.writeBytes(raster, offset, raster.length - offset);
      out.writeByte(0);
      out.writeString(";");
    };
    var bitOutputStream = function(out) {
      var _out = out;
      var _bitLength = 0;
      var _bitBuffer = 0;
      var _this2 = {};
      _this2.write = function(data, length) {
        if (data >>> length != 0) {
          throw "length over";
        }
        while (_bitLength + length >= 8) {
          _out.writeByte(255 & (data << _bitLength | _bitBuffer));
          length -= 8 - _bitLength;
          data >>>= 8 - _bitLength;
          _bitBuffer = 0;
          _bitLength = 0;
        }
        _bitBuffer = data << _bitLength | _bitBuffer;
        _bitLength = _bitLength + length;
      };
      _this2.flush = function() {
        if (_bitLength > 0) {
          _out.writeByte(_bitBuffer);
        }
      };
      return _this2;
    };
    var getLZWRaster = function(lzwMinCodeSize) {
      var clearCode = 1 << lzwMinCodeSize;
      var endCode = (1 << lzwMinCodeSize) + 1;
      var bitLength = lzwMinCodeSize + 1;
      var table = lzwTable();
      for (var i = 0; i < clearCode; i += 1) {
        table.add(String.fromCharCode(i));
      }
      table.add(String.fromCharCode(clearCode));
      table.add(String.fromCharCode(endCode));
      var byteOut = byteArrayOutputStream();
      var bitOut = bitOutputStream(byteOut);
      bitOut.write(clearCode, bitLength);
      var dataIndex = 0;
      var s = String.fromCharCode(_data[dataIndex]);
      dataIndex += 1;
      while (dataIndex < _data.length) {
        var c = String.fromCharCode(_data[dataIndex]);
        dataIndex += 1;
        if (table.contains(s + c)) {
          s = s + c;
        } else {
          bitOut.write(table.indexOf(s), bitLength);
          if (table.size() < 4095) {
            if (table.size() == 1 << bitLength) {
              bitLength += 1;
            }
            table.add(s + c);
          }
          s = c;
        }
      }
      bitOut.write(table.indexOf(s), bitLength);
      bitOut.write(endCode, bitLength);
      bitOut.flush();
      return byteOut.toByteArray();
    };
    var lzwTable = function() {
      var _map = {};
      var _size = 0;
      var _this2 = {};
      _this2.add = function(key) {
        if (_this2.contains(key)) {
          throw "dup key:" + key;
        }
        _map[key] = _size;
        _size += 1;
      };
      _this2.size = function() {
        return _size;
      };
      _this2.indexOf = function(key) {
        return _map[key];
      };
      _this2.contains = function(key) {
        return typeof _map[key] != "undefined";
      };
      return _this2;
    };
    return _this;
  };
  var createDataURL = function(width, height, getPixel) {
    var gif = gifImage(width, height);
    for (var y = 0; y < height; y += 1) {
      for (var x = 0; x < width; x += 1) {
        gif.setPixel(x, y, getPixel(x, y));
      }
    }
    var b = byteArrayOutputStream();
    gif.write(b);
    var base642 = base64EncodeOutputStream();
    var bytes = b.toByteArray();
    for (var i = 0; i < bytes.length; i += 1) {
      base642.writeByte(bytes[i]);
    }
    base642.flush();
    return "data:image/gif;base64," + base642;
  };
  return qrcode2;
}();
!function() {
  qrcode.stringToBytesFuncs["UTF-8"] = function(s) {
    function toUTF8Array(str) {
      var utf8 = [];
      for (var i = 0; i < str.length; i++) {
        var charcode = str.charCodeAt(i);
        if (charcode < 128) utf8.push(charcode);
        else if (charcode < 2048) {
          utf8.push(
            192 | charcode >> 6,
            128 | charcode & 63
          );
        } else if (charcode < 55296 || charcode >= 57344) {
          utf8.push(
            224 | charcode >> 12,
            128 | charcode >> 6 & 63,
            128 | charcode & 63
          );
        } else {
          i++;
          charcode = 65536 + ((charcode & 1023) << 10 | str.charCodeAt(i) & 1023);
          utf8.push(
            240 | charcode >> 18,
            128 | charcode >> 12 & 63,
            128 | charcode >> 6 & 63,
            128 | charcode & 63
          );
        }
      }
      return utf8;
    }
    return toUTF8Array(s);
  };
}();
(function(factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof exports === "object") {
    module.exports = factory();
  }
})(function() {
  return qrcode;
});
var qrcode_default = qrcode;

// supabase/functions/_shared/png.mjs
var QR_PREFIX = "IM26:";
var CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 4294967295;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 255] ^ c >>> 8;
  return (c ^ 4294967295) >>> 0;
}
function u32(n) {
  return [n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255];
}
function chunk(type, data) {
  const t = new TextEncoder().encode(type);
  const body = new Uint8Array(t.length + data.length);
  body.set(t);
  body.set(data, t.length);
  const out = new Uint8Array(12 + data.length);
  out.set(u32(data.length), 0);
  out.set(body, 4);
  out.set(u32(crc32(body)), 8 + data.length);
  return out;
}
async function deflate(bytes) {
  const cs = new CompressionStream("deflate");
  const stream = new Blob([bytes]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
function qrMatrix(text) {
  const q = qrcode_default(0, "M");
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  return { n, dark: (r, c) => q.isDark(r, c) };
}
async function qrPng(text, scale = 10) {
  const { n, dark } = qrMatrix(text);
  const size = (n + 8) * scale;
  const raw = new Uint8Array(size * (size + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size + 1);
    raw[row] = 0;
    const r = Math.floor(y / scale) - 4;
    for (let x = 0; x < size; x++) {
      const c = Math.floor(x / scale) - 4;
      raw[row + 1 + x] = r >= 0 && c >= 0 && r < n && c < n && dark(r, c) ? 0 : 255;
    }
  }
  const ihdr = new Uint8Array([...u32(size), ...u32(size), 8, 0, 0, 0, 0]);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", await deflate(raw)), chunk("IEND", new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((a, p2) => a + p2.length, 0));
  let o = 0;
  for (const p2 of parts) {
    out.set(p2, o);
    o += p2.length;
  }
  return out;
}
function base64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
  return btoa(s);
}

// supabase/functions/_shared/handlers.mjs
var LOTE = 10;
var EMAIL_RE = /^[a-z0-9](?:[a-z0-9._%+-]*[a-z0-9_-])?@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/;
function cors(env) {
  return {
    "Access-Control-Allow-Origin": env("ALLOWED_ORIGIN") || "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
  };
}
function json(env, status, data) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors(env), "Content-Type": "application/json; charset=utf-8" } });
}
async function config(env, fetchImpl, rpc) {
  const supa = (env("SUPABASE_URL") || "").replace(/\/$/, "");
  let db = {};
  try {
    db = await rpc("srv_config_brevo", {}) || {};
  } catch (_) {
    db = {};
  }
  return {
    brevo: { base: env("BREVO_API_BASE") || BREVO_BASE, key: normalizarClave(env("BREVO_API_KEY") || db.clave), fetch: fetchImpl, timeoutMs: Number(env("BREVO_TIMEOUT_MS")) || 2e4 },
    remitente: { email: (env("BREVO_SENDER_EMAIL") || db.remitente || "").trim(), name: (env("BREVO_SENDER_NAME") || db.nombre || "INNOMINING 2026").trim() },
    replyTo: (env("BREVO_REPLY_TO") || "").trim(),
    evento: { fecha: db.evento_fecha || "", lugar: db.evento_lugar || "" },
    qrUrl: env("PUBLIC_QR_URL") || `${supa}/functions/v1/qr`
  };
}
function faltantes(c) {
  const f = [];
  if (!c.brevo.key) f.push("la clave de Brevo");
  if (!c.remitente.email) f.push("el correo remitente");
  return f;
}
async function payloadAcreditacion(c, x, envioId) {
  const png = await qrPng(QR_PREFIX + x.qr_token, 10);
  const d = { nombre: x.nombre, codigo: x.codigo, imgSrc: `${c.qrUrl}?t=${x.qr_token}`, fecha: c.evento.fecha, lugar: c.evento.lugar };
  const p2 = {
    sender: c.remitente,
    to: [x.nombre ? { email: x.email, name: x.nombre } : { email: x.email }],
    subject: ASUNTO,
    htmlContent: correoHtml(d),
    textContent: correoTexto(d),
    attachment: [{ content: base64(png), name: `${x.codigo}_INNOMINING2026.png` }],
    tags: ["innomining2026", `envio-${envioId}`],
    headers: { "X-Mailin-custom": `envio:${envioId}` }
  };
  if (c.replyTo) p2.replyTo = { email: c.replyTo };
  return p2;
}
async function handleEnviar(req, deps2) {
  const env = deps2.env;
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(env) });
  if (req.method !== "POST") return json(env, 405, { error: "M\xE9todo no permitido" });
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const user = jwt ? await deps2.user(jwt) : null;
  if (!user) return json(env, 401, { error: "Sesi\xF3n no v\xE1lida. Inicie sesi\xF3n nuevamente." });
  const rol = await deps2.rpc("srv_rol", { p_id: user.id });
  if (rol !== "admin") return json(env, 403, { error: "Esta acci\xF3n requiere una cuenta de administrador." });
  let body = {};
  try {
    body = await req.json();
  } catch (_) {
  }
  const c = await config(env, deps2.fetch, deps2.rpc);
  try {
    if (body.accion === "estado") return json(env, 200, await estado(c));
    const f = faltantes(c);
    if (f.length) return json(env, 400, { error: `Falta configurar ${f.join(" y ")} en Configuraci\xF3n \u2192 Correo (Brevo).` });
    if (body.accion === "prueba") {
      const to = String(body.destinatario || "").trim().toLowerCase();
      if (!EMAIL_RE.test(to)) return json(env, 400, { error: "Correo de prueba no v\xE1lido." });
      const demo = { nombre: "Participante de prueba", email: to, codigo: "IM26-PRUEBA", qr_token: "PRUEBA" };
      const p2 = await payloadAcreditacion(c, demo, "prueba");
      p2.subject = "[PRUEBA] " + ASUNTO;
      p2.htmlContent = p2.htmlContent.replace(`${c.qrUrl}?t=PRUEBA`, `${c.qrUrl}?demo=1`);
      const r = await enviar(c.brevo, p2);
      await deps2.rpc("srv_registrar_prueba", { p_operador: user.id, p_destinatario: to, p_resultado: r.resultado, p_message_id: r.messageId || null, p_error: r.error || null });
      return json(env, 200, { resultado: r.resultado, messageId: r.messageId || null, error: r.error || null });
    }
    if (body.accion === "enviar") return json(env, 200, await enviarLote(c, deps2, user, body));
    if (body.accion === "verificar") {
      const inc = await deps2.rpc("srv_envio_incierto", { p_participante: body.participante_id });
      if (!inc) return json(env, 200, { resultado: "sin_pendientes" });
      const desde = new Date(new Date(inc.creado_en).getTime() - 864e5);
      const b = await buscarEnvio(c.brevo, inc.email, `envio-${inc.envio_id}`, desde);
      if (b.error) return json(env, 502, { error: b.error });
      if (b.encontrado) {
        await deps2.rpc("srv_finalizar_envio", { p_envio: inc.envio_id, p_resultado: "aceptado", p_message_id: b.messageId, p_error: null });
        return json(env, 200, { resultado: "aceptado", messageId: b.messageId });
      }
      await deps2.rpc("srv_finalizar_envio", { p_envio: inc.envio_id, p_resultado: "temporal", p_message_id: null, p_error: "Brevo no registra este env\xEDo; qued\xF3 pendiente." });
      return json(env, 200, { resultado: "no_encontrado" });
    }
    return json(env, 400, { error: "Acci\xF3n no v\xE1lida." });
  } catch (e) {
    console.error("enviar-qr", e);
    return json(env, 500, { error: "Error interno: " + String(e && e.message || e).slice(0, 200) });
  }
}
async function estado(c) {
  const out = { faltantes: faltantes(c), remitente: c.remitente.email || null, cuenta: null, remitente_verificado: null, problemas: [] };
  if (!c.brevo.key) {
    out.problemas.push("Falta la clave de Brevo: p\xE9guela en Configuraci\xF3n \u2192 Correo (Brevo).");
    return out;
  }
  let a, s;
  try {
    [a, s] = await Promise.all([cuenta(c.brevo), remitentes(c.brevo)]);
  } catch (e) {
    out.problemas.push("No se pudo conectar con Brevo: " + String(e && e.message || e));
    return out;
  }
  if (a.status !== 200) {
    out.problemas.push(`Brevo rechaz\xF3 la clave (${a.status}: ${a.data.message || a.data.code || ""}). Si la clave es correcta, desactive el bloqueo de IP en Brevo \u2192 Seguridad \u2192 IP autorizadas.`);
    return out;
  }
  out.cuenta = {
    email: a.data.email,
    empresa: a.data.companyName,
    planes: (a.data.plan || []).map((p2) => ({ tipo: p2.type, creditos: p2.credits, tipoCreditos: p2.creditsType })),
    relay: a.data.relay ? !!a.data.relay.enabled : null
  };
  const lista = s.data && s.data.senders || [];
  const r = lista.find((x) => String(x.email).toLowerCase() === c.remitente.email.toLowerCase());
  out.remitentes = lista.map((x) => ({ email: x.email, nombre: x.name, activo: !!x.active }));
  if (!c.remitente.email) out.problemas.push("Falta el correo remitente en Configuraci\xF3n \u2192 Correo (Brevo).");
  else if (!r) out.problemas.push(`El remitente ${c.remitente.email} no existe en Brevo. Agr\xE9guelo en Brevo \u2192 Remitentes, dominio, IP.`);
  else if (!r.active) out.problemas.push(`El remitente ${c.remitente.email} existe pero NO est\xE1 verificado/activo en Brevo.`);
  out.remitente_verificado = !!(r && r.active);
  return out;
}
async function enviarLote(c, deps2, user, body) {
  const modo = ["pendientes", "fallidos", "ids"].includes(body.modo) ? body.modo : "pendientes";
  const ids = modo === "ids" ? Array.isArray(body.ids) ? body.ids.slice(0, LOTE) : [] : null;
  await deps2.rpc("srv_liberar_colgados", { p_minutos: 5 });
  const res = await deps2.rpc("srv_reservar_envios", {
    p_operador: user.id,
    p_modo: modo,
    p_ids: ids,
    p_forzar: !!body.forzar,
    p_limite: LOTE
  });
  const lote = res.lote || [];
  const out = { reservados: lote.length, aceptados: 0, fallidos: 0, inciertos: 0, devueltos: 0, errores: [], detenido: null, cupo: res.cupo, limite: res.limite };
  let parar = null;
  for (const x of lote) {
    let r;
    if (parar) r = { resultado: "temporal", error: "No se intent\xF3: " + parar };
    else r = await enviar(c.brevo, await payloadAcreditacion(c, x, x.envio_id));
    await deps2.rpc("srv_finalizar_envio", { p_envio: x.envio_id, p_resultado: r.resultado, p_message_id: r.messageId || null, p_error: r.error || null });
    if (r.resultado === "aceptado") out.aceptados++;
    else if (r.resultado === "fallido") {
      out.fallidos++;
      out.errores.push({ codigo: x.codigo, email: x.email, error: r.error });
    } else if (r.resultado === "incierto") {
      out.inciertos++;
      out.errores.push({ codigo: x.codigo, email: x.email, error: r.error });
    } else out.devueltos++;
    if (r.detener && !parar) {
      parar = r.error;
      out.detenido = r.error;
    }
  }
  if (!lote.length && res.cupo <= 0) out.detenido = `Se alcanz\xF3 el l\xEDmite diario configurado (${res.limite} correos). Los pendientes se conservan.`;
  return out;
}

// ../../../tmp/claude-0/-home-user/e2cf194f-2e12-5fb1-a6f3-59bbbc3c89d9/scratchpad/bund/enviar-qr.ts
var admin = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
var deps = {
  env: (k) => Deno.env.get(k) ?? "",
  fetch: (i, o) => fetch(i, o),
  async rpc(fn, args) {
    const { data, error } = await admin.rpc(fn, args);
    if (error) throw new Error(fn + ": " + error.message);
    return data;
  },
  async user(jwt) {
    const { data, error } = await admin.auth.getUser(jwt);
    return error || !data.user ? null : { id: data.user.id, email: data.user.email };
  }
};
Deno.serve((req) => handleEnviar(req, deps));
