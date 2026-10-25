import io
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import pet_client


class Port:
    def __init__(self):
        self.pending = b"talk\nrelease\nvolume 30\nvolume 65\n"
        self.writes = []

    @property
    def in_waiting(self):
        return len(self.pending)

    def read(self, count):
        data = self.pending[:count]
        self.pending = self.pending[count:]
        return data

    def write(self, value):
        self.writes.append(value)

    def close(self):
        pass


class BridgeTest(unittest.TestCase):
    def test_serial_events_and_repeated_ready_phase(self):
        port = Port()
        states = iter([
            {"phase": "listening", "lastReply": "", "phaseRevision": 1},
            {"phase": "listening", "lastReply": "", "phaseRevision": 2},
        ])
        loops = 0

        def sleep(_seconds):
            nonlocal loops
            loops += 1
            if loops == 2:
                raise KeyboardInterrupt

        with patch.object(pet_client, "serial", SimpleNamespace(SerialException=RuntimeError)), \
             patch.object(pet_client, "open_port", return_value=port), \
             patch.object(pet_client.time, "monotonic", side_effect=[1, 1, 2, 2]), \
             patch.object(pet_client.time, "sleep", side_effect=sleep), \
             patch.object(pet_client.urllib.request, "urlopen", side_effect=lambda *a, **k: io.BytesIO(json.dumps(next(states)).encode())), \
             patch.object(pet_client, "send") as send:
            pet_client.main()

        self.assertEqual(port.writes, [b"listening\n", b"listening\n"])
        self.assertEqual([(c.args[1], c.args[2]) for c in send.call_args_list], [
            ("/api/talk", {"pressed": True}),
            ("/api/talk", {"pressed": False}),
            ("/api/volume", {"level": 65}),
        ])


if __name__ == "__main__":
    unittest.main()
