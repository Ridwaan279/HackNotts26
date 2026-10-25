import json
import os
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request

try:
    import serial  # sudo apt install python3-serial
except ImportError:
    serial = None


# TODO: approve / cancel buttons, same way as talk

def open_port(path):
    port = serial.Serial(path, 115200, timeout=1)
    time.sleep(2)  # opening the port resets most arduinos, wait for it to boot
    return port


def send(base, path, body, context):
    name = path.rsplit("/", 1)[-1]
    request = urllib.request.Request(
        base + path,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=3, context=context):
            pass
        print(f"[{name}] {body}", flush=True)
    except urllib.error.HTTPError as error:
        # 503 on talk means no phone has the wrist mic on
        print(f"[{name}] {error.code} {error.read().decode(errors='ignore')}", flush=True)
    except (urllib.error.URLError, TimeoutError) as error:
        print(f"[{name}] {error}", flush=True)


def main():
    base = os.environ.get("PET_SERVER_URL", "http://127.0.0.1:3000").rstrip("/")
    port_path = os.environ.get("ARDUINO_PORT", "/dev/ttyACM0")
    context = None
    if urllib.parse.urlsplit(base).hostname in ("127.0.0.1", "localhost"):
        # the mkcert cert is for the phone, the pi itself doesnt trust it. fine on loopback
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
    if serial is None:
        print("pyserial missing, printing only. Run: sudo apt install python3-serial", flush=True)

    previous = None
    phase = None
    phase_revision = None
    polled_at = 0
    port = None
    sent = None
    serial_error = None
    buffer = b""
    try:
        while True:
            # state every 0.25s, serial every loop so the talk hold doesnt lag
            if time.monotonic() - polled_at >= 0.25:
                polled_at = time.monotonic()
                try:
                    with urllib.request.urlopen(base + "/api/state", timeout=1, context=context) as response:
                        state = json.load(response)
                    phase = state["phase"]
                    phase_revision = state.get("phaseRevision")
                    current = (phase, state["lastReply"])
                    if current != previous:
                        print(f"[{current[0]}] {current[1]}", flush=True)
                        previous = current
                except (urllib.error.URLError, TimeoutError, ValueError, KeyError) as error:
                    phase = "offline"
                    phase_revision = None
                    if previous != "offline":
                        print(f"[offline] {error}", flush=True)
                        previous = "offline"

            if serial is not None:
                try:
                    if port is None:
                        port = open_port(port_path)
                        sent = None  # the arduino just reset, send the phase again
                        buffer = b""
                        print(f"[serial] connected to {port_path}", flush=True)
                    phase_stamp = (phase, phase_revision)
                    if phase is not None and phase_stamp != sent:
                        port.write(f"{phase}\n".encode())
                        sent = phase_stamp
                    # the arduino sends talk / release when the stick is held down, volume N when the slider moves
                    if port.in_waiting:
                        buffer += port.read(port.in_waiting)
                        *lines, buffer = buffer.split(b"\n")
                        volume = None
                        for line in lines:
                            word = line.decode(errors="ignore").strip()
                            if word in ("talk", "release"):
                                send(base, "/api/talk", {"pressed": word == "talk"}, context)
                            elif word.startswith("volume ") and word[7:].isdigit():
                                volume = int(word[7:])
                        # sliding sends loads of these, only the last one matters
                        if volume is not None:
                            send(base, "/api/volume", {"level": volume}, context)
                    serial_error = None
                except serial.SerialException as error:
                    # unplugged or wrong port, keeps retrying but only prints once
                    if str(error) != serial_error:
                        print(f"[serial] {error}", flush=True)
                        serial_error = str(error)
                    if port is not None:
                        port.close()
                        port = None
            time.sleep(0.05)
    except KeyboardInterrupt:
        if port is not None:
            port.close()
        print("Display adapter stopped.")


if __name__ == "__main__":
    main()
