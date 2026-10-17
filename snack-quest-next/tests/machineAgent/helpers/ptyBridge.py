"""A pseudo-terminal standing in for a serial cable, for the Linux serial transport test.

Prints the slave device path, then for every 20-byte request written to it prints the
request as hex on stdout and waits for a hex reply line on stdin ('-' for silence),
which it writes back in two chunks, as a USB-serial adapter would.
"""
import os, pty, sys

master, slave = pty.openpty()
print(os.ttyname(slave), flush=True)
buffer = b''
while True:
    data = os.read(master, 64)
    if not data:
        break
    buffer += data
    while len(buffer) >= 20:
        frame, buffer = buffer[:20], buffer[20:]
        print(frame.hex(), flush=True)
        reply = sys.stdin.readline().strip()
        if reply and reply != '-':
            raw = bytes.fromhex(reply)
            os.write(master, raw[:7])
            os.write(master, raw[7:])
