#!/usr/bin/env python3
"""Bot-side display exporter. Only calls the existing loopback read-only viewer."""
import argparse
import json
import os
from pathlib import Path
import tempfile
import time
from urllib.request import build_opener, ProxyHandler

from public_discord import CHANNELS, MAX_BYTES, sanitize


def export_once(directory):
    # Never use environment proxies for this private loopback request.
    client = build_opener(ProxyHandler({}))
    bundle = {'schema_version': 1, 'channels': {}}
    for channel in CHANNELS:
        with client.open('http://127.0.0.1:6087/api/messages?channel=' + channel, timeout=5) as response:
            raw = response.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise ValueError('Source exceeds display export limit')
        bundle['channels'][channel] = sanitize(json.loads(raw), channel)
    bundle['updated_at'] = time.time()
    payload = json.dumps(bundle, allow_nan=False, separators=(',', ':')).encode()
    if len(payload) > MAX_BYTES:
        raise ValueError('Display export exceeds size limit')
    directory = Path(directory)
    fd, path = tempfile.mkstemp(prefix='.discord-', dir=directory)
    try:
        with os.fdopen(fd, 'wb') as output:
            output.write(payload)
            output.flush()
            os.fchmod(output.fileno(), 0o640)
        os.replace(path, directory / 'discord-view.json')
    finally:
        if os.path.exists(path):
            os.unlink(path)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', default='/var/lib/project15-public-sync/discord')
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    if args.once:
        export_once(args.output)
    else:
        while True:
            try:
                export_once(args.output)
            except Exception as error:
                # Do not copy potentially private response text/errors into exports/logs.
                print('Display export failed: ' + type(error).__name__, flush=True)
                time.sleep(5)
            else:
                time.sleep(1)
