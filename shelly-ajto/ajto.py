#!/usr/bin/env python3
"""Shelly BLU Door/Window érzékelő -> macOS értesítés nyitáskor/záráskor.

Az érzékelő BTHome v2 hirdetéseket sugároz (service data UUID 0xFCD2),
nincs szükség párosításra. Csak az állapotváltozásról küld értesítést.

Használat:  python3 ajto.py                       (minden FCD2 eszközt figyel)
            python3 ajto.py --nev SBDW           (csak az ilyen nevű eszközt)
            python3 ajto.py --uzenet <telefonszám>  (iMessage is érkezik a számra/e-mailre)
"""
import argparse
import asyncio
import json
import os
import random
import threading
import urllib.request
from datetime import datetime
import subprocess
import sys

from bleak import BleakScanner

BTHOME_UUID = "0000fcd2-0000-1000-8000-00805f9b34fb"
ap = argparse.ArgumentParser()
ap.add_argument("--nev", default=os.environ.get("AJTO_NEV", ""), help="eszköznév részlet szűrő")
ap.add_argument("--uzenet", default=os.environ.get("UZENET", ""), help="telefonszám vagy Apple ID e-mail az iMessage-hez")
ap.add_argument("--szerver", default=os.environ.get("SZERVER", ""), help="Exmentoring szerver URL-je, pl. https://hestencz-mac-mini.tail018e03.ts.net")
ap.add_argument("--token", default=os.environ.get("INGEST_TOKEN", ""), help="az Exmentoring INGEST_TOKEN értéke")
ap.add_argument("--debug", action="store_true", help="minden érkező csomag kiírása")
ARGS = ap.parse_args()
NAME_FILTER = ARGS.nev.lower()

# BTHome v2 objektum ID -> adathossz (bájt), hogy tudjuk átugrani az ismeretleneket
LEN = {0x00: 1, 0x01: 1, 0x05: 3, 0x1A: 1, 0x2D: 1, 0x3A: 1, 0x3F: 2, 0x21: 1, 0x45: 2, 0x08: 2, 0x02: 2, 0x03: 2, 0x04: 3, 0x0C: 2}

# Ebédidő-tippelő: 11:00-13:00 között nyitáskor megtippeli, ki ment ki / jött vissza
EBED_KEZD, EBED_VEG = 11, 13
# a nevek nem kerülnek a kódba: az EBED_NEVEK környezeti változóból jönnek (pl. "Anna,Béla"), üresen nincs tipp
NEVEK = [n.strip() for n in os.environ.get("EBED_NEVEK", "").split(",") if n.strip()]
bent = set(NEVEK)
bent_nap = datetime.now().date()


def tipp():
    """Visszaad egy tippet, ha ebédidő van, különben None. Feltételezi, hogy a tipp igaz."""
    global bent, bent_nap
    most = datetime.now()
    if not NEVEK or not (EBED_KEZD <= most.hour < EBED_VEG):
        return None
    if most.date() != bent_nap:  # új nap: mindenki bent van
        bent, bent_nap = set(NEVEK), most.date()
    kint = set(NEVEK) - bent
    kimegy = bool(bent) and (not kint or random.random() < 0.5)
    if kimegy:
        ki = random.choice(sorted(bent))
        bent.discard(ki)
        return f"Tipp: {ki} ment ki ebédelni 🍽️ (csak tipp!)"
    ki = random.choice(sorted(kint))
    bent.add(ki)
    return f"Tipp: {ki} jött vissza az ebédről 🏃 (csak tipp!)"


state = {}  # eszköz címe -> utolsó állapot (True = nyitva)


def parse(data: bytes):
    """Visszaadja: (nyitva|None, packet_id|None, akku|None)."""
    if not data or data[0] & 0x01:  # titkosított hirdetés – nem támogatott
        return None, None, None
    opened = pid = batt = None
    i = 1
    while i < len(data):
        oid = data[i]
        n = LEN.get(oid)
        if n is None or i + 1 + n > len(data):
            break
        v = data[i + 1]
        if oid in (0x1A, 0x2D):
            opened = bool(v)
        elif oid == 0x00:
            pid = v
        elif oid == 0x01:
            batt = v
        i += 1 + n
    return opened, pid, batt


def post_server(opened):
    """Ajtóállapot küldése az Exmentoring oldalnak (háttérszálon, hogy ne blokkoljon)."""
    def run():
        req = urllib.request.Request(
            ARGS.szerver.rstrip("/") + "/api/door",
            data=json.dumps({"state": "open" if opened else "closed"}).encode(),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {ARGS.token}"},
        )
        try:
            urllib.request.urlopen(req, timeout=10).read()
            print("  szerver: elküldve")
        except Exception as e:
            print(f"  szerver HIBA: {e}")
    threading.Thread(target=run, daemon=True).start()


def notify(title, text):
    script = f'display notification "{text}" with title "{title}" sound name "Glass"'
    subprocess.run(["osascript", "-e", script], check=False)
    if ARGS.uzenet:
        send = (
            'tell application "Messages"\n'
            f'set b to buddy "{ARGS.uzenet}" of (service 1 whose service type = iMessage)\n'
            f'send "{title} – {text}" to b\nend tell'
        )
        r = subprocess.run(["osascript", "-e", send], capture_output=True, text=True)
        print("  iMessage:", "elküldve" if r.returncode == 0 else f"HIBA: {r.stderr.strip()}")


def on_adv(device, adv):
    data = adv.service_data.get(BTHOME_UUID)
    if data is None:
        return
    name = adv.local_name or device.name or ""
    if NAME_FILTER and NAME_FILTER not in name.lower():
        return
    opened, pid, batt = parse(bytes(data))
    if ARGS.debug:
        print(f"  csomag {name or device.address}: {bytes(data).hex()} nyitva={opened} id={pid}")
    if opened is None:
        return
    prev = state.get(device.address)
    state[device.address] = opened
    label = name or device.address
    if prev is None:
        print(f"[{label}] kezdő állapot: {'NYITVA' if opened else 'zárva'} (akku: {batt}%)")
    elif prev != opened:
        msg = "Az ajtó ki lett nyitva" if opened else "Az ajtó be lett csukva"
        t = tipp() if opened else None
        if t:
            msg += f". {t}"
        print(f"[{label}] {msg}")
        if ARGS.szerver:
            post_server(opened)
        notify("🚪 Ajtó" + (" NYITVA" if opened else " zárva"), msg)


async def main():
    print("Figyelés... (Ctrl+C a leállításhoz)")
    async with BleakScanner(on_adv):
        await asyncio.Event().wait()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
