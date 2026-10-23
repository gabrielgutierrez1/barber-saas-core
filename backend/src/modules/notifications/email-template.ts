type Brand = {
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  contactEmail: string;
  contactPhone: string;
};

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );

function webUrl(value: string, base?: string) {
  try {
    const url = new URL(value, base);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? url
      : null;
  } catch {
    return null;
  }
}

/** Render at delivery time so queued messages also receive the current salon branding. */
export function renderEmail(
  job: { key: string; subject: string; text: string },
  salon: Brand,
  publicUrl: string,
) {
  const color = /^#[0-9a-f]{6}$/i.test(salon.primaryColor) ? salon.primaryColor : '#bb865d';
  const site = webUrl(publicUrl);
  const logo = salon.logoUrl ? webUrl(salon.logoUrl) : null;
  const privateMessage = job.key.startsWith('reset:') || job.key.startsWith('booking-access:');
  let action = site ? webUrl('/mi-reserva', site.href) : null;
  let label = 'Consultar mi reserva';
  let body = job.text;
  if (privateMessage) {
    const firstLine = job.text.split('\n')[0];
    const candidate = firstLine.startsWith('Abre ') ? webUrl(firstLine.slice(5)) : null;
    const expectedPath = job.key.startsWith('reset:') ? '/admin' : '/mi-reserva';
    action =
      candidate && site && candidate.origin === site.origin && candidate.pathname === expectedPath
        ? candidate
        : null;
    label = job.key.startsWith('reset:') ? 'Recuperar mi acceso' : 'Ver mi reserva';
    if (action) body = job.text.slice(firstLine.length).trim();
  }
  const contact = [salon.contactEmail, salon.contactPhone]
    .filter(Boolean)
    .map(escapeHtml)
    .join(' · ');
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(job.subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f1ec;color:#292622;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f1ec"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e6dfd6;border-radius:16px;overflow:hidden">
<tr><td style="padding:32px;background:#24221f;border-top:6px solid ${color}">
${logo ? `<img src="${escapeHtml(logo.href)}" alt="${escapeHtml(salon.name)}" width="72" style="display:block;max-width:72px;height:auto;margin-bottom:16px">` : ''}
<p style="margin:0;color:#ffffff;font-size:24px;font-weight:bold">${escapeHtml(salon.name)}</p>
<p style="margin:8px 0 0;color:#d8cfc4;font-size:12px;letter-spacing:2px">UN MOMENTO PARA TI</p></td></tr>
<tr><td style="padding:32px"><h1 style="margin:0 0 24px;font-size:26px;line-height:1.3;color:#292622">${escapeHtml(job.subject)}</h1>
${body
  .split('\n')
  .filter(Boolean)
  .map(
    (line) =>
      `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;overflow-wrap:anywhere">${escapeHtml(line)}</p>`,
  )
  .join('')}
${
  action
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0"><tr><td bgcolor="#24221f" style="border-radius:8px;border-bottom:3px solid ${color}"><a href="${escapeHtml(action.href)}" style="display:inline-block;padding:16px 24px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px">${label}</a></td></tr></table>
<p style="font-size:12px;line-height:1.6;color:#6f665c;overflow-wrap:anywhere">Si el botón no funciona, copia este enlace en tu navegador:<br><a href="${escapeHtml(action.href)}" style="color:#6f665c">${escapeHtml(action.href)}</a></p>`
    : ''
}
</td></tr><tr><td style="padding:24px 32px;background:#faf8f5;border-top:1px solid #e6dfd6;font-size:12px;line-height:1.8;color:#6f665c">
<strong>${escapeHtml(salon.name)}</strong>${contact ? `<br>${contact}` : ''}<br>${privateMessage ? 'Este enlace es privado. No lo compartas.' : 'Gracias por confiar en nosotros.'}
</td></tr></table></td></tr></table></body></html>`;
}
