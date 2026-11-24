import importlib.util
import io
import hashlib
import os
import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch
from datetime import datetime, timezone

from fastapi.testclient import TestClient
from public_discord import CHANNELS, sanitize, display_snapshot
from public_site import create_app


def source(channel):
    now = time.time()
    return dict(channel_id=channel, health=dict(status='observing', fresh=True, updated_at=now),
                messages=[dict(message_id='123', text='<script>alert(1)</script> UP', author='Alice', attachment_urls=['https://secret'], observations=[dict(body=dict(text='UP', secret='hidden'))])],
                btc_market=dict(status='live', published_at=now, close_time=datetime.fromtimestamp(now+900,timezone.utc).isoformat(), quotes=dict(yes_bid=50)),
                execution=dict(connected=True, updated_at=now, error='credential', parser_version='secret',
                               orders=[dict(id='internal', order_id='exchange-secret', channel=channel, filled=1)],
                               pnl=dict(order_pnl={'internal': '1.23'}, trades=[])))


def bundle():
    return dict(schema_version=1, updated_at=time.time(), channels={c:sanitize(source(c), c) for c in CHANNELS})


class DiscordTests(unittest.TestCase):
    def setUp(self):
        salt = 'ab' * 16
        digest = hashlib.pbkdf2_hmac('sha256', b'test-password', bytes.fromhex(salt), 260000).hex()
        env = patch.dict(os.environ, {'PROJECT15_DISCORD_PASSWORD_HASH': salt + ':' + digest})
        env.start()
        self.addCleanup(env.stop)

    def login(self, client):
        self.assertEqual(client.post('/api/discord/session', json={'password':'test-password'}).status_code, 200)

    def test_allowlist_and_join(self):
        data = sanitize(source(CHANNELS[0]), CHANNELS[0])
        text = json.dumps(data)
        for excluded in ('exchange-secret', 'internal', 'credential', 'attachment_urls', 'parser_version', 'hidden'):
            self.assertNotIn(excluded, text)
        order = data['execution']['orders'][0]
        self.assertEqual(data['execution']['pnl']['order_pnl'][order['id']], '1.23')
        self.assertIn('<script>', data['messages'][0]['text'])  # Rendered through textContent.

    def test_password_logout_expiry_and_rate_limit(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = TestClient(create_app(tmp), base_url='https://example.com')
            self.assertEqual(client.post('/api/discord/session', json={'password':'wrong'}).status_code,401)
            self.assertEqual(client.get('/api/discord/messages?channel='+CHANNELS[1]).status_code,401)
            self.assertEqual(client.post('/api/discord/session', json={'password':'test-password'},headers={'Origin':'https://evil.example'}).status_code,403)
            self.login(client)
            cookie = client.cookies.get('discord_session')
            self.assertTrue(cookie)
            self.assertNotIn('Enter password',client.get('/discord').text)
            with patch('discord_auth.time.time', return_value=time.time()+43201):
                self.assertEqual(client.get('/api/discord/messages').status_code,401)
            client.post('/api/discord/logout')
            client.cookies.set('discord_session',cookie)
            self.assertEqual(client.get('/api/discord/messages').status_code,401)
            codes=[client.post('/api/discord/session',json={'password':'wrong'}).status_code for _ in range(12)]
            self.assertIn(429,codes)
            self.assertEqual(client.get('/').status_code,200)

    def test_freshness_search_and_no_mutation(self):
        b = bundle()
        self.assertEqual(display_snapshot(b, CHANNELS[0])['btc_market']['quotes']['yes_bid'], 50)
        result = display_snapshot(b, CHANNELS[0], now=time.time()+3)
        self.assertFalse(result['stale'])
        self.assertEqual(result['btc_market']['quotes'], {})
        self.assertTrue(result['execution']['connected'])
        result = display_snapshot(b, CHANNELS[0], now=time.time()+25)
        self.assertTrue(result['stale'])
        self.assertFalse(result['health']['fresh'])
        self.assertFalse(result['execution']['connected'])
        self.assertEqual(len(display_snapshot(b, CHANNELS[0], 'alice')['messages']), 1)
        self.assertEqual(display_snapshot(b, CHANNELS[0], 'missing')['messages'], [])
        self.assertTrue(b['channels'][CHANNELS[0]]['execution']['connected'])

    def test_expired_quote_hidden_even_when_recent(self):
        b = bundle()
        b['channels'][CHANNELS[0]]['btc_market']['close_time']='2000-01-01T00:00:00+00:00'
        self.assertEqual(display_snapshot(b, CHANNELS[0])['btc_market']['quotes'], {})

    def test_export_is_atomic_and_failure_retains_last_file(self):
        spec=importlib.util.spec_from_file_location('discord_exporter', Path(__file__).parents[1]/'deploy/discord/exporter.py')
        exporter=importlib.util.module_from_spec(spec);spec.loader.exec_module(exporter)
        class Client:
            def open(self, url, timeout):
                return io.BytesIO(json.dumps(source(url.split('channel=')[1])).encode())
        with tempfile.TemporaryDirectory() as tmp, patch.object(exporter,'build_opener',return_value=Client()):
            exporter.export_once(tmp)
            path=Path(tmp)/'discord-view.json'
            old=path.read_bytes()
            self.assertEqual(set(json.loads(old)['channels']),set(CHANNELS))
            with patch.object(Client,'open',side_effect=TimeoutError):
                with self.assertRaises(TimeoutError): exporter.export_once(tmp)
            self.assertEqual(path.read_bytes(),old)
            self.assertEqual([p.name for p in Path(tmp).iterdir()],['discord-view.json'])

    def test_routes_boundary_cache_and_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)/'discord-view.json'
            client = TestClient(create_app(tmp))
            self.assertEqual(client.get('/api/discord/messages').status_code, 401)
            self.assertIn('Enter password',client.get('/discord').text)
            self.login(client)
            self.assertEqual(client.get('/api/discord/messages').status_code, 503)
            path.write_text(json.dumps(bundle()))
            self.assertEqual(client.get('/discord').status_code, 200)
            self.assertEqual(client.get('/discord/app.js').status_code, 200)
            self.assertEqual(client.get('/discord/private.json').status_code, 404)
            self.assertEqual(client.post('/api/discord/messages').status_code, 405)
            self.assertEqual(client.get('/api/discord/messages?channel=unknown').status_code, 400)
            self.assertEqual(client.get('/api/discord/messages').status_code, 200)
            b=bundle();b['channels'][CHANNELS[0]]['messages'][0]['text']='changed'
            replacement=Path(tmp)/'new';replacement.write_text(json.dumps(b));replacement.replace(path)
            self.assertEqual(client.get('/api/discord/messages').json()['messages'][0]['text'], 'changed')
            path.write_text('broken')
            self.assertEqual(client.get('/api/discord/messages').status_code, 503)
            for route in ('/api/control','/api/manual/orders','/discord-view.json','/docs'):
                self.assertEqual(client.get(route).status_code, 404)

    def test_optional_sync_allowlist(self):
        spec=importlib.util.spec_from_file_location('discord_sync', Path(__file__).parents[1]/'deploy/discord/sync.py')
        worker=importlib.util.module_from_spec(spec);spec.loader.exec_module(worker)
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);state=root/'state';source_dir=root/'source'
            source_dir.mkdir();(state/'staging').mkdir(parents=True);(state/'discord').mkdir()
            for name in ('history-status.json', 'view.json', *worker.HISTORIES):
                (source_dir/name).write_text('{}')
            calls=[]
            with patch.object(worker,'SOURCE',source_dir),patch.object(worker,'STATE',state),patch.object(worker,'transfer',lambda stage,names:calls.append(names)):
                worker.sync_once()
                self.assertEqual(len(calls),3)
                (state/'discord'/'discord-view.json').write_text(json.dumps(bundle()))
                worker.sync_once()
                self.assertEqual(calls[-1],['discord-view.json'])
                (state/'discord'/'discord-view.json').write_text('invalid')
                calls.clear()
                with self.assertRaises(ValueError): worker.sync_once()
                self.assertEqual(calls[-1],['history-status.json'])

if __name__ == '__main__': unittest.main()
