import json
import os
import time
import urllib.error
import urllib.request


# TODO: buttons with gpiozero (lgpio pin factory on the pi 5), talk / approve / cancel

def main():
    base = os.environ.get("PET_SERVER_URL", "http://127.0.0.1:3000").rstrip("/")
    previous = None
    try:
        while True:
            try:
                with urllib.request.urlopen(base + "/api/state", timeout=3) as response:
                    state = json.load(response)
                current = (state["phase"], state["lastReply"])
                if current != previous:
                    print(f"[{current[0]}] {current[1]}", flush=True)
                    # TODO: swap the print for the actual screen driver, one pet sprite per phase
                    previous = current
            except (urllib.error.URLError, TimeoutError, ValueError, KeyError) as error:
                if previous != "offline":
                    print(f"[offline] {error}", flush=True)
                    previous = "offline"
            time.sleep(1)
    except KeyboardInterrupt:
        print("Display adapter stopped.")


if __name__ == "__main__":
    main()
