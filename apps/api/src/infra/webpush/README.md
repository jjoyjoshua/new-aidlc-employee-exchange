# webpush

Web Push dispatch (REQ-026). Opt-in only (BR-001.15), and **never for reminders** (BR-001.16).

The VAPID key pair comes from configuration; the private key is server-only. A subscription's
`keys` (`p256dh`, `auth`) never reach a log line — the logger redacts them, and that is a
constraint rather than a habit (`security-standards.md`).
