"""ComputeIT site: serves ./static and accepts contact-form submissions.

Submissions are stored in SQLite and emailed to the team; the sender gets an
automatic acknowledgement. SMTP settings are currently hardcoded below for
debugging; the environment variables are commented out for now:

    SMTP_HOST     SMTP server (email is skipped if unset)
    SMTP_PORT      default 587 (STARTTLS); 465 uses implicit TLS
    SMTP_STARTTLS  set to 0 to disable STARTTLS (e.g. local relay), default 1
    SMTP_USER      login user (optional)
    SMTP_PASSWORD  login password (optional)
    SMTP_FROM      From address, default SMTP_USER or computeit@computeit.sk
    CONTACT_TO     where submissions go, default computeit@computeit.sk
    DB_PATH        SQLite file, default ./computeit.db
    FORM_SECRET    key for signing form tokens; random per process if unset
                   (a restart then invalidates forms already open in browsers)
"""
import hashlib
import hmac
import logging
import os
import secrets
import smtplib
import sqlite3
import time
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).parent
DB_PATH = Path(os.getenv("DB_PATH", BASE_DIR / "computeit.db"))

CONTACT_TO = "computeit@computeit.sk"
SMTP_HOST = "smtp.protonmail.ch"
SMTP_PORT = 587
SMTP_STARTTLS = True
SMTP_USER = "computeit@computeit.sk"
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM = SMTP_USER

# Bot protection: submissions faster than this after the form loaded are dropped.
FORM_MIN_SECONDS = 3
FORM_SECRET = (os.getenv("FORM_SECRET") or secrets.token_hex(32)).encode()

log = logging.getLogger("uvicorn.error")
app = FastAPI(title="ComputeIT")


# ───────── Database ─────────
def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with db() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS submissions (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                received   TEXT NOT NULL,
                name       TEXT NOT NULL,
                email      TEXT NOT NULL,
                type       TEXT NOT NULL,
                message    TEXT NOT NULL,
                email_sent INTEGER NOT NULL DEFAULT 0
            )"""
        )


init_db()


# ───────── Email ─────────
def one_line(s: str) -> str:
    """Collapse whitespace so user input can't break email headers."""
    return " ".join(s.split())


def send(msgs: list[EmailMessage]) -> None:
    smtp_cls = smtplib.SMTP_SSL if SMTP_PORT == 465 else smtplib.SMTP
    with smtp_cls(SMTP_HOST, SMTP_PORT, timeout=20) as smtp:
        if SMTP_PORT != 465 and SMTP_STARTTLS:
            smtp.starttls()
        if SMTP_USER:
            smtp.login(SMTP_USER, SMTP_PASSWORD)
        for msg in msgs:
            smtp.send_message(msg)


def email_submission(submission_id: int, form: "Contact") -> None:
    if not SMTP_HOST:
        log.warning("SMTP_HOST not set; skipping email for submission #%d", submission_id)
        return

    name, sender = one_line(form.name), one_line(form.email)

    notify = EmailMessage()
    notify["Subject"] = f"[ComputeIT web] {one_line(form.type) or 'Contact'} — {name}"
    notify["From"] = SMTP_FROM
    notify["To"] = CONTACT_TO
    notify["Reply-To"] = sender
    notify.set_content(
        f"New contact form submission #{submission_id}\n\n"
        f"Name:  {name}\n"
        f"Email: {sender}\n"
        f"Need:  {form.type}\n\n"
        f"{form.message}\n"
    )

    reply = EmailMessage()
    reply["Subject"] = "Thanks for contacting ComputeIT"
    reply["From"] = SMTP_FROM
    reply["To"] = sender
    reply["Reply-To"] = CONTACT_TO
    reply.set_content(
        f"Hi {name.split()[0]},\n\n"
        "thank you for reaching out to ComputeIT. We have received your message "
        "and an engineer will get back to you within one business day.\n\n"
        "For reference, here is what you sent us:\n\n"
        + "\n".join(f"> {line}" for line in form.message.splitlines())
        + "\n\nBest regards,\nThe ComputeIT team\nhttps://computeit.sk\n"
    )

    try:
        send([notify, reply])
    except Exception:
        log.exception("Failed to send email for submission #%d", submission_id)
        return
    with db() as conn:
        conn.execute("UPDATE submissions SET email_sent = 1 WHERE id = ?", (submission_id,))
    log.info("Emails sent for submission #%d", submission_id)


# ───────── Form tokens ─────────
def sign(ts: str) -> str:
    return hmac.new(FORM_SECRET, ts.encode(), hashlib.sha256).hexdigest()


def token_age(token: str) -> float | None:
    """Seconds since the token was issued, or None if it is missing or forged."""
    ts, _, sig = token.partition(".")
    if not ts.isdigit() or not hmac.compare_digest(sig, sign(ts)):
        return None
    return time.time() - int(ts)


# ───────── API ─────────
class Contact(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    email: str = Field(pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$", max_length=320)
    type: str = Field(default="", max_length=200)
    message: str = Field(min_length=20, max_length=10_000)
    # Honeypot: hidden in the page, so only bots fill it in.
    website: str = Field(default="", max_length=500)
    # Signed load time from /api/form-token, for the minimum-fill-time check.
    token: str = Field(default="", max_length=200)


@app.get("/api/form-token")
def form_token():
    ts = str(int(time.time()))
    return {"token": f"{ts}.{sign(ts)}"}


@app.post("/api/contact")
def contact(form: Contact, background: BackgroundTasks):
    ok = {
        "ok": True,
        "message": f"Thanks, {form.name.split()[0]} — your message is in. "
        "An engineer will reply within one business day.",
    }
    if form.website:
        # Pretend it worked so the bot has no signal to adapt to.
        log.info("Dropped honeypot submission from %s <%s>", form.name, form.email)
        return ok
    age = token_age(form.token)
    if age is None:
        raise HTTPException(400, "This form has expired. Please reload the page and try again.")
    if age < FORM_MIN_SECONDS:
        log.info("Dropped too-fast submission (%.1fs) from %s <%s>", age, form.name, form.email)
        return ok

    with db() as conn:
        cur = conn.execute(
            "INSERT INTO submissions (received, name, email, type, message) VALUES (?, ?, ?, ?, ?)",
            (datetime.now(timezone.utc).isoformat(), form.name, form.email, form.type, form.message),
        )
        submission_id = cur.lastrowid
    log.info("Contact form #%d from %s <%s>", submission_id, form.name, form.email)
    # Send after the response so the visitor isn't kept waiting on SMTP.
    background.add_task(email_submission, submission_id, form)
    return ok


# Mounted last so /api routes take precedence; html=True serves index.html at "/".
app.mount("/", StaticFiles(directory=BASE_DIR / "static", html=True), name="static")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
