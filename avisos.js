// Aviso diario de vencimientos de calibración — PETROSAR
// Lo ejecuta Vercel Cron todos los días (ver vercel.json). Manda UN mail con:
//  1) equipos cuyo vencimiento cae dentro de la anticipación configurada (por defecto 5 días)
//     y que todavía no fueron avisados  → marca aviso_enviado
//  2) equipos que recibieron su ÚLTIMA calibración permitida (por defecto 4): hay que
//     comprar/reponer el equipo → marca aviso_reposicion
// Los equipos dados de baja no se informan.
// Prueba desde el navegador:  /api/avisos?key=<CRON_SECRET>&dry=1  (muestra qué enviaría, sin enviar)
//                             /api/avisos?key=<CRON_SECRET>        (envía de verdad)
const nodemailer = require('nodemailer');

const env = k => (process.env[k] || '').trim();
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = s => (s ? s.split('-').reverse().join('/') : '');

module.exports = async (req, res) => {
  const secret = env('CRON_SECRET');
  // Autorización: header de Vercel Cron, o ?key=CRON_SECRET para probar desde el navegador
  const q = req.query || {};
  if (secret && req.headers.authorization !== `Bearer ${secret}` && q.key !== secret) return res.status(401).json({ error: 'No autorizado' });

  const SB = env('SUPABASE_URL'), KEY = env('SUPABASE_SERVICE_KEY');
  const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
  const get = async p => { const r = await fetch(`${SB}/rest/v1/${p}`, { headers: H }); if (!r.ok) throw new Error(await r.text()); return r.json(); };

  try {
    const hoy = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); // fecha Argentina (UTC-3)
    const diff = d => Math.round((Date.parse(d) - Date.parse(hoy)) / 864e5);

    const cfgRows = await get('calib_config?id=eq.cfg&select=data');
    const cfg = (cfgRows[0] && cfgRows[0].data && cfgRows[0].data.cfg) || {};
    const av = cfg.avisos || {};
    const dias = Number(av.dias) || 5;
    const maxCal = Number(cfg.maxCal) || 4;
    const ciclo = r => Number(r.ciclo || (r.data && r.data.ciclo) || 1);
    const dest = (av.dest || env('AVISO_DESTINATARIOS')).split(/[,;\s]+/).filter(x => x.includes('@'));

    const rows = await get('calib_certificados?select=id,token,nro,serie,id_equipo,modelo,fecha,proxima,tecnico,ciclo,baja,aviso_enviado,aviso_reposicion,creado,data&order=fecha.desc,creado.desc');
    // vigente = último certificado de cada N° de serie
    const asg = await get('calib_asignaciones?hasta=is.null&select=serie,persona,base,desde&order=desde.asc');
    const quien = {}; asg.forEach(a => { quien[a.serie.toUpperCase()] = a; });
    const per = r => { const a = quien[r.serie.toUpperCase()]; return a && a.persona ? esc(a.persona) : '<span style="color:#718096">Sin asignar</span>'; };
    const bas = r => { const a = quien[r.serie.toUpperCase()]; return a && a.base ? esc(a.base) : '—'; };
    const latest = {};
    rows.forEach(r => { const k = r.serie.toUpperCase(); if (!latest[k]) latest[k] = r; });
    const activos = Object.values(latest).filter(r => !r.baja && !(r.data && r.data.baja));
    const due = activos.filter(r => !r.aviso_enviado && diff(r.proxima) <= dias).sort((a, b) => a.proxima.localeCompare(b.proxima));
    const rep = activos.filter(r => ciclo(r) >= maxCal && !r.aviso_reposicion).sort((a, b) => a.proxima.localeCompare(b.proxima));

    if (!due.length && !rep.length) return res.json({ hoy, dias, enviados: 0 });
    if (!dest.length) return res.status(400).json({ error: 'No hay destinatarios configurados', pendientes: due.length + rep.length });

    const base = (cfg.baseUrl || env('APP_URL') || `https://${req.headers.host}/`).replace(/\/?$/, '/');
    const td = 'padding:6px 8px;border-bottom:1px solid #e2e8f0';
    const filas = due.map(r => {
      const d = diff(r.proxima);
      let est = d < 0 ? `<b style="color:#b91c1c">VENCIDO hace ${-d} d</b>` : d === 0 ? '<b style="color:#b91c1c">VENCE HOY</b>' : `<b style="color:#b45309">en ${d} días</b>`;
      if (ciclo(r) >= maxCal) est += '<br><b style="color:#b91c1c">DESCARTAR</b> (última calibración)';
      const sens = ((r.data && r.data.sensores) || []).map(s => s.sensor.split(' ')[0]).join('/');
      return `<tr><td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-family:Consolas,monospace"><b>${esc(r.serie)}</b></td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">${per(r)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0"><b>${bas(r)}</b></td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">${fmt(r.fecha)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0"><b>${fmt(r.proxima)}</b></td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">${est}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0"><a href="${base}?v=${encodeURIComponent(r.token)}">${/^INV-/.test(r.nro) ? 'ver' : esc(r.nro)}</a></td></tr>`;
    }).join('');
    const filasRep = rep.map(r => `<tr><td style="${td};font-family:Consolas,monospace"><b>${esc(r.serie)}</b></td>
        <td style="${td}">${per(r)}</td><td style="${td}"><b>${bas(r)}</b></td>
        <td style="${td}"><b style="color:#b91c1c">${ciclo(r)}/${maxCal}</b></td>
        <td style="${td}">${fmt(r.fecha)}</td><td style="${td}"><b>${fmt(r.proxima)}</b></td>
        <td style="${td}"><a href="${base}?v=${encodeURIComponent(r.token)}">${/^INV-/.test(r.nro) ? 'ver' : esc(r.nro)}</a></td></tr>`).join('');
    const th = 'padding:6px 8px';
    const secVto = due.length ? `<p style="margin:0 0 10px">${due.length === 1 ? 'Hay <b>1 equipo</b>' : `Hay <b>${due.length} equipos</b>`} con la calibración vencida o por vencer dentro de los próximos ${dias} días:</p>
        <table style="border-collapse:collapse;width:100%;font-size:13px">
          <thead><tr style="background:#f0f2f6;text-align:left;font-size:11px;text-transform:uppercase;color:#4a5568">
            <th style="${th}">N° de serie</th><th style="${th}">Asignado a</th><th style="${th}">Base</th>
            <th style="${th}">Calibrado</th><th style="${th}">Vence</th><th style="${th}">Estado</th><th style="${th}">Certificado</th></tr></thead>
          <tbody>${filas}</tbody></table>` : '';
    const secRep = rep.length ? `<div style="margin-top:${due.length ? 18 : 0}px;background:#f3e8ff;border:1px solid #e9d5ff;border-radius:8px;padding:10px 12px">
        <div style="font-weight:700;color:#581c87;margin-bottom:6px">⚠ Reponer equipos: ${rep.length} en su última calibración permitida (${maxCal}/${maxCal})</div>
        <div style="font-size:12.5px;color:#581c87;margin-bottom:8px">Estos detectores son descartables: no pueden volver a calibrarse. Quedan en servicio hasta la fecha de vencimiento; planificá la compra del reemplazo.</div>
        <table style="border-collapse:collapse;width:100%;font-size:13px;background:#fff">
          <thead><tr style="background:#f0f2f6;text-align:left;font-size:11px;text-transform:uppercase;color:#4a5568">
            <th style="${th}">N° de serie</th><th style="${th}">Asignado a</th><th style="${th}">Base</th><th style="${th}">Calib.</th>
            <th style="${th}">Calibrado</th><th style="${th}">Fuera de servicio</th><th style="${th}">Certificado</th></tr></thead>
          <tbody>${filasRep}</tbody></table></div>` : '';
    const n = due.length;
    const html = `<div style="font-family:Segoe UI,Arial,sans-serif;color:#1a202c;max-width:760px">
      <div style="background:#1e2d3e;color:#fff;padding:14px 18px;border-radius:8px 8px 0 0">
        <div style="font-size:17px;font-weight:700">Calibración de detectores · ${n && rep.length ? 'vencimientos y reposición' : n ? 'aviso de vencimiento' : 'reposición de equipos'}</div>
        <div style="font-size:12px;opacity:.75">${esc(cfg.empresa || 'PETROSAR S.A.')} · ${esc(cfg.sector || 'Servicio Técnico')}</div></div>
      <div style="border:1px solid #e2e8f0;border-top:0;padding:14px 18px;border-radius:0 0 8px 8px">
        ${secVto}${secRep}
        <p style="margin:14px 0 0"><a href="${base}#vencimientos" style="background:#e8a020;color:#1a202c;padding:8px 14px;border-radius:6px;text-decoration:none;font-weight:700">Abrir control de vencimientos</a></p>
        <p style="font-size:11px;color:#718096;margin-top:16px">Aviso automático. Cada equipo se informa una sola vez por certificado; al recalibrarlo se reinicia el control. Máximo ${maxCal} calibraciones por equipo.</p>
      </div></div>`;
    const list = a => a.map(r => (quien[r.serie.toUpperCase()] || {}).persona || r.serie).slice(0, 4).join(', ') + (a.length > 4 ? '…' : '');
    const subject = 'Calibración: ' + [n ? `${n} equipo${n > 1 ? 's' : ''} por vencer (${list(due)})` : '', rep.length ? `${rep.length} a reponer (${list(rep)})` : ''].filter(Boolean).join(' · ');

    if (req.query && req.query.dry === '1') return res.json({ hoy, dias, maxCal, dest, subject,
      vencimientos: due.map(r => ({ serie: r.serie, proxima: r.proxima })), reposicion: rep.map(r => ({ serie: r.serie, ciclo: ciclo(r) })) });

    const port = Number(env('SMTP_PORT')) || 587;
    const tx = nodemailer.createTransport({ host: env('SMTP_HOST'), port, secure: port === 465, auth: { user: env('SMTP_USER'), pass: env('SMTP_PASS') } });
    await tx.sendMail({ from: env('SMTP_FROM') || env('SMTP_USER'), to: dest.join(', '), subject, html });

    const mark = async (arr, field) => {
      if (!arr.length) return;
      const ids = arr.map(r => `"${r.id}"`).join(',');
      const up = await fetch(`${SB}/rest/v1/calib_certificados?id=in.(${encodeURIComponent(ids)})`,
        { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ [field]: hoy }) });
      if (!up.ok) throw new Error('Mail enviado pero no se pudo marcar: ' + (await up.text()));
    };
    await mark(due, 'aviso_enviado');
    await mark(rep, 'aviso_reposicion');

    return res.json({ hoy, dias, enviados: n, reposicion: rep.length, dest });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
