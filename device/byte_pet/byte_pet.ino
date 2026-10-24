// pi sends the phase as a line over usb (idle / thinking / acting / error / offline)
// TODO: just the built in led for now, swap showPhase() for the actual screen

char line[32];
byte length = 0;
char phase[32] = "offline";

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  // dont block on serial or the blinking stops
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n') {
      line[length] = '\0';
      strcpy(phase, line);
      length = 0;
    } else if (c != '\r' && length < sizeof(line) - 1) {
      line[length++] = c;
    }
  }
  showPhase();
}

void showPhase() {
  unsigned long now = millis();
  bool on;
  if (strcmp(phase, "idle") == 0) {
    on = (now / 1000) % 2;
  } else if (strcmp(phase, "thinking") == 0) {
    on = (now / 150) % 2;
  } else if (strcmp(phase, "acting") == 0) {
    on = true;
  } else if (strcmp(phase, "error") == 0) {
    unsigned long t = now % 1000;
    on = t < 100 || (t > 200 && t < 300);  // double flash
  } else {
    on = false;
  }
  digitalWrite(LED_BUILTIN, on ? HIGH : LOW);
}
