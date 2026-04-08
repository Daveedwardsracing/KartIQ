from __future__ import annotations

import smtplib
import ssl
from email.message import EmailMessage


def email_settings_ready(settings: dict | None) -> bool:
    settings = settings or {}
    return all(
        [
            (settings.get("smtpHost") or "").strip(),
            str(settings.get("smtpPort") or "").strip(),
            (settings.get("fromEmail") or "").strip(),
        ]
    )


def send_email(settings: dict, to_email: str, subject: str, body_text: str) -> None:
    if not email_settings_ready(settings):
        raise RuntimeError("Email settings are incomplete")

    host = str(settings.get("smtpHost", "")).strip()
    port = int(settings.get("smtpPort") or 0)
    username = str(settings.get("smtpUsername", "")).strip()
    password = str(settings.get("smtpPassword", "")).strip()
    from_email = str(settings.get("fromEmail", "")).strip()
    from_name = str(settings.get("fromName", "")).strip() or "DER UniPro Coaching Platform"
    use_tls = bool(settings.get("useTls", True))
    use_ssl = bool(settings.get("useSsl", False))
    allow_invalid_certificates = bool(settings.get("allowInvalidCertificates", False))

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = f"{from_name} <{from_email}>"
    message["To"] = to_email
    message.set_content(body_text)

    ssl_context = ssl._create_unverified_context() if allow_invalid_certificates else ssl.create_default_context()

    if use_ssl:
        with smtplib.SMTP_SSL(host, port, context=ssl_context, timeout=20) as smtp:
            if username:
                smtp.login(username, password)
            smtp.send_message(message)
        return

    with smtplib.SMTP(host, port, timeout=20) as smtp:
        if use_tls:
            smtp.starttls(context=ssl_context)
        if username:
            smtp.login(username, password)
        smtp.send_message(message)
