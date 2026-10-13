# Bandeja de Entrada IMAP

La lectura de correo usa la conexión IMAP segura (TLS) del buzón cPanel; las respuestas se envían mediante la API de Brevo. El remitente verificado configurado para Brevo se conserva y `IMAP_USER` se utiliza como dirección `Reply-To`.

Configura estas variables en el `.env` local y en **Render → Environment**:

| Variable | Uso |
| --- | --- |
| `IMAP_HOST` | Host IMAP de cPanel, por ejemplo `mail.tudominio.com`. |
| `IMAP_USER` | Dirección del buzón; también se usa como `Reply-To`. |
| `IMAP_PASS` | Contraseña del buzón. |
| `IMAP_PORT` | Puerto IMAP sobre TLS; opcional, por defecto `993`. |

No publiques las credenciales ni las agregues al repositorio. Brevo debe tener verificada la dirección de remitente configurada para el envío saliente.
