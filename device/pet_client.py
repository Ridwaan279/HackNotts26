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


# TODO: buttons on the arduino (talk / approve / cancel), read them back as lines from the same port

def open_port(path):
    port = serial.Serial(path, 115200, timeout=1)
    time.sleep(2)  # opening the port resets most arduinos, wait for it to boot
    return port


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
    port = None
    sent = None
    serial_error = None
    try:
        while True:
            try:
                with urllib.request.urlopen(base + "/api/state", timeout=3, context=context) as response:
                    state = json.load(response)
                phase = state["phase"]
                current = (phase, state["lastReply"])
                if current != previous:
                    print(f"[{current[0]}] {current[1]}", flush=True)
                    previous = current
            except (urllib.error.URLError, TimeoutError, ValueError, KeyError) as error:
                phase = "offline"
                if previous != "offline":
                    print(f"[offline] {error}", flush=True)
                    previous = "offline"

            if serial is not None:
                try:
                    if port is None:
                        port = open_port(port_path)
                        sent = None  # the arduino just reset, send the phase again
                        print(f"[serial] connected to {port_path}", flush=True)
                    if phase != sent:
                        port.write(f"{phase}\n".encode())
                        sent = phase
                    serial_error = None
                except serial.SerialException as error:
                    # unplugged or wrong port, keeps retrying but only prints once
                    if str(error) != serial_error:
                        print(f"[serial] {error}", flush=True)
                        serial_error = str(error)
                    if port is not None:
                        port.close()
                        port = None
            # fast enough that the face changes as soon as you hold the mic
            time.sleep(0.25)
    except KeyboardInterrupt:
        if port is not None:
            port.close()
        print("Display adapter stopped.")


if __name__ == "__main__":
    main()
