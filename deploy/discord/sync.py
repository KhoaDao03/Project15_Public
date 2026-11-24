#!/usr/bin/env python3
"""Push only sanitized exports; never access trading code or credentials."""
import argparse
import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import time

SOURCE = Path('/var/lib/project15-public')
STATE = Path('/var/lib/project15-public-sync')
SYMBOLS = ('BTC','ETH','SOL','XRP','BNB','DOGE','GOLD','SILVER','WTI','PLATINUM','PALLADIUM','COPPER','NATGAS','EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD')
HISTORIES = tuple(f'history-{s}.json' for s in SYMBOLS)
MAX_BYTES = 8 * 1024 * 1024

def capture(stage):
    # Pin file content by opening the atomic export; capture metadata first.
    for name in ('history-status.json', *HISTORIES, 'view.json'):
        with (SOURCE / name).open('rb') as source:
            data = source.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise ValueError(f'{name} exceeds export limit')
        json.loads(data)
        (stage / name).write_bytes(data)

def transfer(stage, names):
    args = ['rsync', '-p', '--checksum', '--chmod=F640', '--timeout=15',
            '-e', f'ssh -F {STATE}/ssh_config',
            *(str(stage / name) for name in names), 'project15-public:./']
    process = subprocess.Popen(args, start_new_session=True)
    try:
        code = process.wait(timeout=25)
    except BaseException:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait()
        raise
    if code:
        raise RuntimeError(f'rsync exited with status {code}')

def capture_discord(stage):
    path = STATE / 'discord' / 'discord-view.json'
    if not path.exists():
        return False
    with path.open('rb') as source:
        data = source.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError('Discord display export exceeds limit')
    bundle = json.loads(data)
    if bundle.get('schema_version') != 1:
        raise ValueError('Invalid Discord display schema')
    (stage / 'discord-view.json').write_bytes(data)
    return True


def sync_once(check_only=False):
    with tempfile.TemporaryDirectory(prefix='batch-', dir=STATE / 'staging') as directory:
        stage = Path(directory)
        capture(stage)
        if check_only:
            print(f'Validated all {len(HISTORIES) + 2} exports without transferring.', flush=True)
            return
        transfer(stage, ['view.json'])
        transfer(stage, HISTORIES)
        # Do not mark destination histories fresh unless all transferred.
        transfer(stage, ['history-status.json'])
        # Optional display feed: failures cannot prevent the main data publication.
        if capture_discord(stage):
            transfer(stage, ['discord-view.json'])

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--once', action='store_true')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    if args.once or args.check:
        sync_once(check_only=args.check)
    else:
        while True:
            try:
                sync_once()
            except Exception as error:
                print(f'Sync failed: {error}', flush=True)
                time.sleep(5)
            else:
                time.sleep(1)
