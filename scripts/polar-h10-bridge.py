#!/usr/bin/env python3
"""Read a chest strap over Bluetooth and print one reading per line.

Why this exists in Python next to a TypeScript repository: a Bluetooth Low
Energy peripheral has no address a server can dial, so something has to hold
the connection. On Windows the usual Node BLE packages want a WinUSB driver
swapped under the Bluetooth adapter, which takes the adapter away from
everything else on the machine. `bleak` talks to the operating system's own
stack, on Windows, macOS and Linux, with nothing installed and no driver
touched. Paying one pipe to keep the machine intact is the right trade for a
demo that has to work on a filming day.

What it reads is the standard Bluetooth Heart Rate Service (0x180D),
characteristic Heart Rate Measurement (0x2A37), which a Polar H10 publishes
like any other compliant strap. It gives a rate in beats per minute and, when
the device sends them, the intervals between beats. It does NOT give an ECG
trace: the H10 has one, on Polar's own service at 130 Hz, and that is a
different job. So nothing downstream ever draws a waveform.

    pip install bleak

    python scripts/polar-h10-bridge.py --self-test
    python scripts/polar-h10-bridge.py --scan
    python scripts/polar-h10-bridge.py --subject fe-1
    python scripts/polar-h10-bridge.py --subject fe-1 --address 00:11:22:33:44:55

Stdout is one JSON object per line and nothing else, so a parent process can
read it straight. Everything a human needs to read goes to stderr. The
`biomed` slot spawns this and feeds what it prints to its own service; run it
by hand to check a strap before a rehearsal.
"""

import argparse
import asyncio
import json
import sys
from datetime import datetime, timezone

HEART_RATE_SERVICE = "0000180d-0000-1000-8000-00805f9b34fb"
HEART_RATE_MEASUREMENT = "00002a37-0000-1000-8000-00805f9b34fb"

# The standard carries the intervals in units of 1/1024 s.
RR_UNIT_MS = 1000.0 / 1024.0


def log(message):
    """Anything a person reads goes to stderr; stdout stays machine-readable."""
    print(message, file=sys.stderr, flush=True)


def parse_measurement(data):
    """One Heart Rate Measurement notification, as the specification defines it.

    Byte 0 is flags: bit 0 says whether the rate is 8 or 16 bits, bits 1 and 2
    carry sensor contact, bit 3 says energy expended is present, bit 4 says the
    beat-to-beat intervals follow. Everything is little-endian.
    """
    if not data:
        raise ValueError("empty notification")

    flags = data[0]
    wide = flags & 0x01
    contact_supported = bool(flags & 0x04)
    contact = bool(flags & 0x02) if contact_supported else None
    has_energy = bool(flags & 0x08)
    has_rr = bool(flags & 0x10)

    offset = 1
    if wide:
        bpm = int.from_bytes(data[offset:offset + 2], "little")
        offset += 2
    else:
        bpm = data[offset]
        offset += 1

    if has_energy:
        offset += 2

    rr_ms = []
    if has_rr:
        while offset + 1 < len(data):
            raw = int.from_bytes(data[offset:offset + 2], "little")
            offset += 2
            rr_ms.append(round(raw * RR_UNIT_MS, 1))

    return bpm, rr_ms, contact


async def find_device(address, name_prefix, timeout):
    """The strap, by address if one was given, else the first one advertising the service."""
    from bleak import BleakScanner

    if address:
        log(f"looking for {address}")
        device = await BleakScanner.find_device_by_address(address, timeout=timeout)
        if device is None:
            raise SystemExit(f"no device at {address} within {timeout:g} s (is the strap on a chest? it advertises only when worn)")
        return device

    log(f"scanning {timeout:g} s for a heart rate strap")
    devices = await BleakScanner.discover(timeout=timeout, service_uuids=[HEART_RATE_SERVICE])
    if name_prefix:
        devices = [d for d in devices if (d.name or "").lower().startswith(name_prefix.lower())]
    if not devices:
        raise SystemExit(
            "no strap found. A Polar H10 advertises only when it is worn and damp at the electrodes; "
            "and it talks to one host at a time, so close any phone app that holds it."
        )
    if len(devices) > 1:
        log("several straps in range: " + ", ".join(f"{d.name or '?'} ({d.address})" for d in devices))
    return devices[0]


async def scan(timeout):
    from bleak import BleakScanner

    log(f"scanning {timeout:g} s")
    devices = await BleakScanner.discover(timeout=timeout, service_uuids=[HEART_RATE_SERVICE])
    if not devices:
        log("nothing advertising the heart rate service")
        return
    for d in devices:
        log(f"{d.address}  {d.name or '(no name)'}")


async def stream(subject, address, name_prefix, timeout, source):
    from bleak import BleakClient

    device = await find_device(address, name_prefix, timeout)
    log(f"connecting to {device.name or '(no name)'} ({device.address})")

    def on_notify(_characteristic, data):
        try:
            bpm, rr_ms, contact = parse_measurement(bytes(data))
        except Exception as e:  # a malformed frame must not take the bridge down
            log(f"unreadable notification: {e}")
            return
        sample = {
            "subjectId": subject,
            "bpm": bpm,
            "at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "source": source,
        }
        if rr_ms:
            sample["rrMs"] = rr_ms
        if contact is not None:
            sample["contact"] = contact
        print(json.dumps(sample, separators=(",", ":")), flush=True)

    async with BleakClient(device) as client:
        log(f"connected; subscribing to the heart rate measurement for {subject}")
        await client.start_notify(HEART_RATE_MEASUREMENT, on_notify)
        log("streaming; stop with Ctrl-C")
        try:
            while client.is_connected:
                await asyncio.sleep(1.0)
        finally:
            # Best effort: the strap is often already gone by the time we get here.
            try:
                await client.stop_notify(HEART_RATE_MEASUREMENT)
            except Exception:
                pass
    log("disconnected")


def self_test():
    """The decoder, against frames built from the specification.

    Worth having because the strap is not here yet and because a wrong shift
    would show a plausible heart rate that is simply false, which is the one
    failure this project cannot afford. Needs no Bluetooth and no bleak.
    """
    cases = [
        # flags, bytes, expected bpm, expected rr, expected contact
        ("8-bit rate, nothing else", b"\x00\x3c", 60, [], None),
        ("16-bit rate", b"\x01\x3c\x00", 60, [], None),
        ("8-bit rate and one interval of exactly one second", b"\x10\x3c\x00\x04", 60, [1000.0], None),
        ("contact supported and detected, two intervals", b"\x16\x50\x00\x04\x00\x03", 80, [1000.0, 750.0], True),
        ("contact supported, not detected", b"\x04\x50", 80, [], False),
        ("energy expended present, then an interval", b"\x18\x46\x10\x27\x00\x04", 70, [1000.0], None),
    ]
    failures = 0
    for name, data, bpm, rr, contact in cases:
        got_bpm, got_rr, got_contact = parse_measurement(data)
        ok = got_bpm == bpm and got_rr == rr and got_contact == contact
        log(f"{'ok  ' if ok else 'FAIL'} {name}: {got_bpm} bpm, rr {got_rr}, contact {got_contact}")
        if not ok:
            failures += 1
            log(f"      expected {bpm} bpm, rr {rr}, contact {contact}")
    for name, data in [("empty frame", b"")]:
        try:
            parse_measurement(data)
            log(f"FAIL {name}: should have been refused")
            failures += 1
        except ValueError:
            log(f"ok   {name}: refused")
    log(f"{len(cases) + 1 - failures}/{len(cases) + 1} passed")
    return failures


def main(argv=None):
    parser = argparse.ArgumentParser(description="Read a Bluetooth heart rate strap and print one JSON reading per line.")
    parser.add_argument("--subject", help="the subject id these readings belong to, as the biomed roster names it")
    parser.add_argument("--address", help="the strap's Bluetooth address; scans when absent")
    parser.add_argument("--name-prefix", default="", help="only consider straps whose name starts with this, e.g. Polar")
    parser.add_argument("--timeout", type=float, default=12.0, help="seconds to look for the strap (default 12)")
    parser.add_argument("--source", default="polar-h10", help="what to record as the source of each reading")
    parser.add_argument("--scan", action="store_true", help="list the straps in range and exit")
    parser.add_argument("--self-test", action="store_true", help="check the decoder against frames from the specification, with no Bluetooth and no bleak")
    args = parser.parse_args(argv)

    # Before anything that needs a radio or a package.
    if args.self_test:
        raise SystemExit(1 if self_test() else 0)

    try:
        import bleak  # noqa: F401
    except ImportError:
        raise SystemExit("bleak is not installed: pip install bleak")

    try:
        if args.scan:
            asyncio.run(scan(args.timeout))
            return
        if not args.subject:
            raise SystemExit("--subject is required (or use --scan)")
        asyncio.run(stream(args.subject, args.address, args.name_prefix, args.timeout, args.source))
    except KeyboardInterrupt:
        log("stopped")


if __name__ == "__main__":
    main()
