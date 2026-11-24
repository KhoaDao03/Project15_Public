"""Small server-side password gate; bounded, expiring in-memory sessions."""
import hashlib
import hmac
import os
import secrets
import threading
import time

# PBKDF2 digest only. The password is never shipped to the browser.
DEFAULT_HASH = 'ae2208a322b7d4d0d6750c69e1238ff2:74f432411abfd3b002c040dc84c626eac0615704f42524467a3125fc7a752310'
COOKIE = 'discord_session'
TTL = 12 * 60 * 60


class DiscordAuth:
    def __init__(self):
        self.password_hash = os.environ.get('PROJECT15_DISCORD_PASSWORD_HASH', DEFAULT_HASH)
        self.sessions = {}
        self.lock = threading.Lock()
        self.tokens = 10.0
        self.checked = time.monotonic()

    def valid(self, token):
        with self.lock:
            return self.sessions.get(token, 0) > time.time()

    def login(self, password):
        with self.lock:
            now = time.monotonic()
            self.tokens = min(10, self.tokens + (now - self.checked) / 6)
            self.checked = now
            if self.tokens < 1:
                return 429, None
            self.tokens -= 1
        salt, expected = self.password_hash.split(':')
        actual = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), 260000).hex()
        if not hmac.compare_digest(actual, expected):
            return 401, None
        token = secrets.token_urlsafe(32)
        with self.lock:
            self.sessions = {k:v for k,v in self.sessions.items() if v > time.time()}
            if len(self.sessions) >= 256:
                del self.sessions[next(iter(self.sessions))]
            self.sessions[token] = time.time() + TTL
        return 200, token

    def logout(self, token):
        with self.lock:
            self.sessions.pop(token, None)
