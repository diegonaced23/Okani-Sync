import { MAGIC_LINK_EXPIRES_IN_SECONDS } from "../../src/lib/constants";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** HTML del email de bienvenida. Sin JSX para compatibilidad con el runtime de Convex. */
export function welcomeEmailHtml(name: string, signInUrl: string): string {
  const safeName = escapeHtml(name);
  const safeSignInUrl = signInUrl.startsWith("https://") ? escapeHtml(signInUrl) : "#";
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bienvenido a Okany Sync</title>
</head>
<body style="margin:0;padding:0;background:#1F262A;font-family:system-ui,sans-serif;color:#F5F5F5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#1F262A;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#343434;border-radius:12px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="padding:32px 40px;border-bottom:1px solid #3D4448;">
              <span style="font-size:24px;font-weight:700;color:#4ADE80;">Okany</span>
              <span style="font-size:24px;font-weight:300;color:#F5F5F5;"> Sync</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <h1 style="margin:0 0 16px;font-size:20px;color:#F5F5F5;">
                ¡Bienvenido, ${safeName}! 👋
              </h1>
              <p style="margin:0 0 12px;font-size:14px;color:#A3A8AB;line-height:1.6;">
                Tu cuenta en <strong style="color:#F5F5F5;">Okany Sync</strong> ha sido creada exitosamente.
                Ya puedes iniciar sesión y comenzar a gestionar tus finanzas personales.
              </p>
              <p style="margin:0 0 24px;font-size:14px;color:#A3A8AB;line-height:1.6;">
                Inicia sesión con tu correo electrónico usando el enlace mágico o tu contraseña.
              </p>
              <a href="${safeSignInUrl}"
                 style="display:inline-block;background:#4ADE80;color:#052e16;font-weight:700;
                        font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;">
                Iniciar sesión →
              </a>
            </td>
          </tr>
          <!-- Features -->
          <tr>
            <td style="padding:0 40px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:16px;background:#2A3236;border-radius:8px;font-size:12px;color:#A3A8AB;">
                    <strong style="color:#4ADE80;">✦ Cuentas multi-moneda</strong><br/>
                    Gestiona COP, USD, EUR y más en un solo lugar.
                  </td>
                </tr>
                <tr><td style="height:8px;"></td></tr>
                <tr>
                  <td style="padding:16px;background:#2A3236;border-radius:8px;font-size:12px;color:#A3A8AB;">
                    <strong style="color:#4ADE80;">✦ Tarjetas con interés compuesto</strong><br/>
                    Calcula automáticamente tus cuotas con desglose capital/interés.
                  </td>
                </tr>
                <tr><td style="height:8px;"></td></tr>
                <tr>
                  <td style="padding:16px;background:#2A3236;border-radius:8px;font-size:12px;color:#A3A8AB;">
                    <strong style="color:#4ADE80;">✦ Presupuestos y alertas</strong><br/>
                    Controla tus gastos con presupuestos por categoría y notificaciones push.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #3D4448;font-size:11px;color:#A3A8AB;">
              Si no esperabas este correo, puedes ignorarlo.
              Okany Sync · Gestión de finanzas personales
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** HTML del email para definir/restablecer la contraseña. */
export function resetPasswordEmailHtml(url: string): string {
  const safeUrl = url.startsWith("https://") || url.startsWith("http://localhost")
    ? escapeHtml(url)
    : "#";
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Restablece tu contraseña — Okany Sync</title>
</head>
<body style="margin:0;padding:0;background:#1F262A;font-family:system-ui,sans-serif;color:#F5F5F5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#1F262A;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#343434;border-radius:12px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="padding:32px 40px;border-bottom:1px solid #3D4448;">
              <span style="font-size:24px;font-weight:700;color:#4ADE80;">Okany</span>
              <span style="font-size:24px;font-weight:300;color:#F5F5F5;"> Sync</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <h1 style="margin:0 0 16px;font-size:20px;color:#F5F5F5;">
                Restablece tu contraseña 🔒
              </h1>
              <p style="margin:0 0 24px;font-size:14px;color:#A3A8AB;line-height:1.6;">
                Usa este enlace para definir una nueva contraseña en <strong style="color:#F5F5F5;">Okany Sync</strong>.
                Expira pronto y solo funciona una vez.
              </p>
              <a href="${safeUrl}"
                 style="display:inline-block;background:#4ADE80;color:#052e16;font-weight:700;
                        font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;">
                Definir contraseña →
              </a>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #3D4448;font-size:11px;color:#A3A8AB;">
              Si no solicitaste este correo, puedes ignorarlo con tranquilidad.
              Okany Sync · Gestión de finanzas personales
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** HTML del email con el enlace mágico de acceso (login sin contraseña / reset de acceso). */
export function magicLinkEmailHtml(url: string): string {
  const safeUrl = url.startsWith("https://") || url.startsWith("http://localhost")
    ? escapeHtml(url)
    : "#";

  const minutes = Math.round(MAGIC_LINK_EXPIRES_IN_SECONDS / 60);

  // Si el enlace caduca, la salida es pedir otro desde /sign-in. El origen sale
  // del propio magic link (se arma con SITE_URL), así que no hace falta una
  // variable de entorno extra en Convex.
  let signInUrl: string | null = null;
  try {
    signInUrl = new URL(url).origin + "/sign-in";
  } catch {
    signInUrl = null;
  }

  const expiredHint = signInUrl
    ? `¿Ya caducó? Pide uno nuevo en <a href="${escapeHtml(signInUrl)}" style="color:#4ADE80;">${escapeHtml(signInUrl)}</a>.`
    : "¿Ya caducó? Pide uno nuevo desde la pantalla de inicio de sesión.";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tu enlace de acceso a Okany Sync</title>
</head>
<body style="margin:0;padding:0;background:#1F262A;font-family:system-ui,sans-serif;color:#F5F5F5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#1F262A;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#343434;border-radius:12px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="padding:32px 40px;border-bottom:1px solid #3D4448;">
              <span style="font-size:24px;font-weight:700;color:#4ADE80;">Okany</span>
              <span style="font-size:24px;font-weight:300;color:#F5F5F5;"> Sync</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <h1 style="margin:0 0 16px;font-size:20px;color:#F5F5F5;">
                Tu enlace de acceso 🔑
              </h1>
              <p style="margin:0 0 24px;font-size:14px;color:#A3A8AB;line-height:1.6;">
                Usa este enlace para iniciar sesión en <strong style="color:#F5F5F5;">Okany Sync</strong>.
                Caduca en ${minutes} minutos y solo funciona una vez.
              </p>
              <a href="${safeUrl}"
                 style="display:inline-block;background:#4ADE80;color:#052e16;font-weight:700;
                        font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;">
                Iniciar sesión →
              </a>
              <p style="margin:24px 0 0;font-size:13px;color:#A3A8AB;line-height:1.6;">
                ${expiredHint}
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #3D4448;font-size:11px;color:#A3A8AB;">
              Si no solicitaste este correo, puedes ignorarlo con tranquilidad.
              Okany Sync · Gestión de finanzas personales
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
