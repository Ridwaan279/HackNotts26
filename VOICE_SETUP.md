# Hold-to-talk setup

## What changed

The joystick's **SW button on D9** is now the voice trigger. The old sketch
checked a rotated analogue axis instead, and its `rawX >= 1000` condition
also rejected full travel on a standard joystick.

- Hold SW for half a second to request the phone microphone.
- Wait for the second, microphone-ready chirp, then speak while holding SW.
- Release SW to stop recording and send the recognised text.
- Two short clicks still toggle disco. Disco ends after five seconds.
- No phone acknowledgement within eight seconds ends the attempt. Release
  the button before trying again.

The phone now clears its recording state after natural browser endings,
permission failures and start failures. Releasing before recognition starts
is handled too. A server phase revision lets the USB adapter forward a new
microphone-ready acknowledgement even if its previous phase was also listening.

## Connections

| Part | Arduino pin |
| --- | --- |
| Joystick VRx | A1 |
| Joystick VRy | A2 |
| Joystick SW | D9 |
| Joystick VCC / GND | 5V / GND |
| Potentiometer | A0 |
| Buzzer | D5 |
| Touch sensor | D7 |
| PIR OUT | D8 |
| Left / right ear signals | D2 / D3 |
| Rocker contacts | D4 and GND |
| Grove RGB LCD | I2C |

The servo supply and Arduino must share GND. Keep using the existing
external servo supply. Leave the joystick centred during Arduino startup.

## Start the system

1. Upload `Arduino_code/Arduino_code.ino`. Close Arduino Serial Monitor
   before starting the USB adapter; it needs the same serial port.
2. Use Node 24 or newer. Install dependencies with `npm ci`.
3. Keep your existing `.env` settings. If the phone connects directly to the
   backend over Wi-Fi, use `HOST=0.0.0.0`, configure `TLS_CERT` and `TLS_KEY`,
   and make sure the phone trusts that certificate. An ordinary HTTP LAN
   address does not grant browser microphone access.
4. Run `npm run build`, then `npm start` in one terminal.
5. In a second terminal on the Pi, install pyserial if needed:

   ```bash
   sudo apt install python3-serial
   ```

   If the backend is HTTPS on the same Pi:

   ```bash
   PET_SERVER_URL=https://127.0.0.1:3000 ARDUINO_PORT=/dev/ttyACM0 python3 device/pet_client.py
   ```

   Use `http://127.0.0.1:3000` instead if that backend is HTTP, such as an
   existing USB localhost forwarding setup. If the backend runs on another
   computer, use its reachable URL and trust its HTTPS certificate on the Pi.
   The adapter must use the same protocol and port as the backend.

6. Open the built app on Android Chrome. On Wi-Fi this will be your trusted
   HTTPS address, such as `https://<PI-IP>:3000`.
7. Tap **Use wrist mic** on the phone, grant microphone permission and keep
   the app visible with the phone unlocked. This also enables speaker audio.
8. Hold SW on the pet. Wait for the ready chirp and the phone's Listening
   indication, speak, then release.

The Arduino is a controller, not a microphone: the Python adapter and the
phone page must both be running. Browser speech recognition can depend on
an online service. ElevenLabs spoken replies also need internet access and
`ELEVENLABS_API_KEY`. Replies come from Hermes Agent at `HERMES_URL`.

## Troubleshooting

- **Phone's own Hold to talk button fails:** fix HTTPS, microphone permission
  or speech-recognition support before debugging the joystick. Test in Chrome.
- **`No phone has the wrist mic on`:** open the page and enable Use wrist mic.
- **Adapter says offline:** check `PET_SERVER_URL`, HTTP versus HTTPS, and
  whether the backend is running.
- **No serial connection:** check `ARDUINO_PORT`, the USB data cable, and that
  Serial Monitor is closed. Some boards use `/dev/ttyUSB0` instead.
- **It listens but gives no answer:** check Hermes and Ollama are running; for
  spoken replies, check the ElevenLabs key and network connection.

## Checks

```bash
npm test
npm run build
python3 -m unittest discover -s device -p 'test_*.py'
```

Tests cover phone recognition lifecycle, the talk/release API path and the
USB bridge's event forwarding. The firmware's hold, release, double-click,
timeout and standby behaviour was also checked with simulated pins/serial.
These checks do not replace testing the actual joystick, Android microphone,
USB connection, Hermes and ElevenLabs together.
