#include <Wire.h>
#include "rgb_lcd.h"
#include <Servo.h>

rgb_lcd lcd;

Servo leftEar;
Servo rightEar;

const byte LEFT_EAR_PIN = 2;
const byte RIGHT_EAR_PIN = 3;
const byte POWER_SWITCH_PIN = 4;
const byte PIR_PIN = 8;
const byte TOUCH_PIN = 7;

// Petting code
const unsigned long TOUCH_DEBOUNCE_MS = 30;
const unsigned long PET_LINGER_MS = 2200;
const unsigned long DOUBLE_TAP_MS = 600;
const unsigned long PET_HOLD_MS = 600;
bool pettingActive = false;
bool pettingDrawn = false;
bool touchStable = false;
bool touchLastReading = false;
bool havePreviousTap = false;
bool doubleTapBoost = false;
unsigned long touchChangedAt = 0;
unsigned long touchStartedAt = 0;
unsigned long previousTapAt = 0;
unsigned long lastPetAt = 0;
unsigned long petAnimationStartedAt = 0;
unsigned long doubleTapAt = 0;
int drawnHeartFrame = -1;

// Pet goes to sleep if 30sec of no motion detected 
const unsigned long SLEEP_TIMEOUT_MS = 30000UL;
const unsigned long PIR_WARMUP_MS = 6000UL;
unsigned long pirPoweredAt = 0;
unsigned long lastMotionAt = 0;
bool pirReady = false;
bool sleeping = true;
const unsigned long SWITCH_DEBOUNCE_MS = 40;

bool petOn = false;
int lastSwitchReading = HIGH;
int stableSwitchState = HIGH;
unsigned long switchChangedAt = 0;

// Ears
const int LEFT_REST = 90;
const int RIGHT_REST = 90;
const int LEFT_FLAP = 65;
const int RIGHT_FLAP = 115;

const unsigned long FACE_DURATION = 3000;
const unsigned long EAR_STEP_TIME = 180;
const unsigned long BLINK_INTERVAL = 2200;
const unsigned long BLINK_DURATION = 150;

byte openEye[8] = {
  B01110, B11111, B10011, B10011, B11111, B11101, B01110, B00000
};

byte closedEye[8] = {
  B00000, B00000, B00000, B10001, B11111, B01110, B00000, B00000
};

byte happyEye[8] = {
  B00000, B01110, B11111, B11011, B10001, B00000, B00000, B00000
};

byte smileLeft[8] = {
  B00000, B10000, B01000, B00100, B00011, B00000, B00000, B00000
};

byte smileMiddle[8] = {
  B00000, B00000, B00000, B00000, B11111, B00000, B00000, B00000
};

byte smileRight[8] = {
  B00000, B00001, B00010, B00100, B11000, B00000, B00000, B00000
};

byte roundMouth[8] = {
  B00000, B01110, B10001, B10001, B10001, B01110, B00000, B00000
};

enum Face {
  NORMAL,
  HAPPY,
  SURPRISED,
  SLEEPY
};

Face currentFace = NORMAL;

// Analogue joystick
const byte JOY_X_PIN = A1;
const byte JOY_Y_PIN = A2;
const int JOY_DEADZONE = 90;
const int JOY_RANGE = 280; 
const bool INVERT_JOY_X = false;
const bool INVERT_JOY_Y = false;
const unsigned long JOY_HOLD_MS = 1500;
const unsigned long JOY_SAMPLE_MS = 40;
int joyCentreX = 512, joyCentreY = 512;
int joyX = 0, joyY = 0;
bool joystickActive = false;
bool joystickDrawn = false;
unsigned long lastJoystickSample = 0;
unsigned long lastJoystickActivity = 0;
int drawnX = 999, drawnY = 999;

unsigned long lastFaceChange = 0;
unsigned long lastBlink = 0;
unsigned long blinkStarted = 0;

bool blinking = false;

// Ear animation state
bool earsMoving = false;
byte earStep = 0;
unsigned long lastEarStep = 0;

//////////////////////////////////// FUNCTIONS TO DRAW FACE

void drawEyes(byte eyeType) {
  lcd.setCursor(5, 0);
  lcd.write(eyeType);

  lcd.setCursor(10, 0);
  lcd.write(eyeType);
}

void drawSmile() {
  lcd.setCursor(7, 1);
  lcd.write((uint8_t)3);
  lcd.write((uint8_t)4);
  lcd.write((uint8_t)5);
}

void restEars() {
  leftEar.write(LEFT_REST);
  rightEar.write(RIGHT_REST);
}

void startEarFlap() {
  leftEar.write(LEFT_FLAP);
  rightEar.write(RIGHT_FLAP);

  earStep = 0;
  earsMoving = true;
  lastEarStep = millis();
}

//////////////////////////////////// FUNCTIONS FOR EARS

void updateEars(unsigned long now) {
  if (!earsMoving) {
    return;
  }

  if (now - lastEarStep < EAR_STEP_TIME) {
    return;
  }

  lastEarStep = now;
  earStep++;

  if (earStep == 1 || earStep == 3) {
    restEars();
  } else if (earStep == 2) {
    leftEar.write(LEFT_FLAP);
    rightEar.write(RIGHT_FLAP);
  }

  if (earStep >= 3) {
    earsMoving = false;
  }
}

//////////////////////////////////// FUNCTIONS TO RENDER FACE

void loadFaceCharacters() {
  lcd.createChar(0, openEye);
  lcd.createChar(1, closedEye);
  lcd.createChar(2, happyEye);
  lcd.createChar(3, smileLeft);
  lcd.createChar(4, smileMiddle);
  lcd.createChar(5, smileRight);
  lcd.createChar(6, roundMouth);
  joystickDrawn = false;
  pettingDrawn = false;
}

void renderFace(Face face) {
  if (joystickDrawn || pettingDrawn) loadFaceCharacters();
  lcd.clear();

  switch (face) {
    case NORMAL:
      lcd.setRGB(100, 200, 80);
      drawEyes(0);
      drawSmile();
      break;

    case HAPPY:
      lcd.setRGB(255, 160, 30);
      drawEyes(2);
      drawSmile();
      break;

    case SURPRISED:
      lcd.setRGB(60, 120, 255);
      drawEyes(0);
      lcd.setCursor(8, 1);
      lcd.write((uint8_t)6);
      break;

    case SLEEPY:
      lcd.setRGB(60, 20, 100);
      drawEyes(1);
      lcd.setCursor(8, 1);
      lcd.print("-");
      lcd.setCursor(13, 0);
      lcd.print("zZ");
      break;
  }

}

void showFace(Face face) {
  currentFace = face;
  blinking = false;
  renderFace(face);
  lastFaceChange = millis();
  lastBlink = lastFaceChange;
  startEarFlap();
}

void updateBlink(unsigned long now) {
  if (currentFace != NORMAL) {
    return;
  }

  if (!blinking && now - lastBlink >= BLINK_INTERVAL) {
    drawEyes(1);
    blinking = true;
    blinkStarted = now;
  }

  if (blinking && now - blinkStarted >= BLINK_DURATION) {
    drawEyes(0);
    blinking = false;
    lastBlink = now;
  }
}

// Volume
const byte POT_PIN = A0;
const byte BUZZER_PIN = 5;
const unsigned long POT_SAMPLE_MS = 20;
const unsigned long VOLUME_SCREEN_MS = 2000;
const unsigned long BEEP_INTERVAL_MS = 500;
const unsigned long BEEP_DURATION_MS = 100;
const int VOLUME_DEADBAND = 2;
int filteredPot = 0;
int volumePercent = 0;
bool volumeScreen = false;
unsigned long lastPotSample = 0;
unsigned long volumeStartedAt = 0;
unsigned long lastVolumeChange = 0;
unsigned long beepStartedAt = 0;


//////////////////////////////////// SOUND (REMOVE LATER ONCE ELEVEN LABS IS ADDED)
enum SoundID {
  SOUND_NONE, SOUND_ON, SOUND_WAKE, SOUND_SLEEP,
  SOUND_PET, SOUND_DOUBLE_PET, SOUND_JOYSTICK
};

const uint16_t soundDurations[7][7] = {
  {0, 0, 0, 0, 0, 0, 0},
  {55, 0, 0, 0, 0, 0, 0},       // ON: one short chirp
  {65, 65, 110, 0, 0, 0, 0},     // Wake: two cheerful chirps
  {180, 0, 0, 0, 0, 0, 0},      // Sleep: one soft longer buzz
  {45, 50, 45, 50, 85, 0, 0},   // Petting: three little chirps
  {35, 40, 35, 40, 35, 40, 75}, // Double pet: four quick chirps
  {40, 0, 0, 0, 0, 0, 0}        // Joystick: a tiny click-like chirp
};
const byte soundLengths[7] = {0, 1, 3, 1, 5, 7, 1};
const byte soundLevels[7] = {0, 65, 100, 45, 80, 90, 60};
SoundID activeSound = SOUND_NONE;
byte soundStep = 0;
unsigned long soundStepStartedAt = 0;

void startSound(SoundID sound);
void startSound(SoundID sound) {
  if (!petOn || volumeScreen) return;
  activeSound = sound;
  soundStep = 0;
  soundStepStartedAt = millis();
}

void updateBuzzer(unsigned long now) {
  if (!petOn) {
    activeSound = SOUND_NONE;
    analogWrite(BUZZER_PIN, 0);
    return;
  }

  int pwm = map(volumePercent, 0, 100, 0, 127);
  if (volumeScreen) {
    activeSound = SOUND_NONE;
    bool on = ((now - beepStartedAt) % BEEP_INTERVAL_MS) < BEEP_DURATION_MS;
    analogWrite(BUZZER_PIN, on ? pwm : 0);
    return;
  }

  if (activeSound == SOUND_NONE) {
    analogWrite(BUZZER_PIN, 0);
    return;
  }

  while (now - soundStepStartedAt >= soundDurations[activeSound][soundStep]) {
    soundStepStartedAt += soundDurations[activeSound][soundStep];
    soundStep++;
    if (soundStep >= soundLengths[activeSound]) {
      activeSound = SOUND_NONE;
      analogWrite(BUZZER_PIN, 0);
      return;
    }
  }

  int level = (long)pwm * soundLevels[activeSound] / 100;
  analogWrite(BUZZER_PIN, (soundStep % 2 == 0) ? level : 0);
}

void setSleeping(bool shouldSleep, unsigned long now) {
  bool changed = (sleeping != shouldSleep);
  sleeping = shouldSleep;
  if (changed) startSound(sleeping ? SOUND_SLEEP : SOUND_WAKE);
  blinking = false;
  currentFace = sleeping ? SLEEPY : NORMAL;
  lastFaceChange = now;
  lastBlink = now;

  if (!volumeScreen && !joystickActive && !pettingActive) renderFace(currentFace);

  if (sleeping) {
    earsMoving = false;
    restEars();
  } else {
    startEarFlap();
  }
}

void updateMotion(unsigned long now) {
  bool motion = (digitalRead(PIR_PIN) == HIGH);

  if (!pirReady) {
    if (now - pirPoweredAt >= PIR_WARMUP_MS && !motion) {
      pirReady = true;
    }
    return;
  }

  if (!petOn) return;

  if (motion) {
    lastMotionAt = now;
    if (sleeping) setSleeping(false, now);
  } else if (!sleeping && now - lastMotionAt >= SLEEP_TIMEOUT_MS) {
    setSleeping(true, now);
  }
}

int potToPercent(int raw) {
  if (raw <= 10) return 0;
  if (raw >= 1013) return 100;
  return map(raw, 10, 1013, 0, 100);
}

void renderVolume() {
  lcd.setCursor(0, 0);
  lcd.print("Volume:         ");
  lcd.setCursor(8, 0);
  lcd.print(volumePercent);
  lcd.print("%");

  int segments = map(volumePercent, 0, 100, 0, 16);
  lcd.setCursor(0, 1);
  for (int i = 0; i < 16; i++) {
    if (i < segments) lcd.write((uint8_t)7);
    else lcd.print(" ");
  }
  lcd.setRGB(255, 130, 20);
}

void updatePot(unsigned long now) {
  if (now - lastPotSample < POT_SAMPLE_MS) return;
  lastPotSample = now;

  filteredPot = (3L * filteredPot + analogRead(POT_PIN)) / 4;
  int candidate = potToPercent(filteredPot);
  int difference = abs(candidate - volumePercent);
  bool atEndpoint = (candidate == 0 || candidate == 100);

  if (candidate == volumePercent ||
      (difference < VOLUME_DEADBAND && !atEndpoint)) return;

  volumePercent = candidate;
  if (!petOn) return;

  if (!volumeScreen) {
    volumeScreen = true;
    volumeStartedAt = now;
    blinking = false;
  }

  lastVolumeChange = now;
  beepStartedAt = now;
  renderVolume();
}

void updateVolumeScreen(unsigned long now) {
  if (!volumeScreen) return;

  if (now - lastVolumeChange >= VOLUME_SCREEN_MS) {
    volumeScreen = false;
    lastFaceChange = now;
    lastBlink = now;
    blinking = false;
    if (!joystickActive && !pettingActive) renderFace(currentFace);
    // Force a full joystick redraw if it is still active.
    drawnX = 999;
    drawnHeartFrame = -1;
    return;
  }
}

// JOYSTICK EYES MOVEMENT
int axisOffset(int reading, int centre, bool invert) {
  int offset = reading - centre;
  if (abs(offset) <= JOY_DEADZONE) return 0;
  offset = constrain(offset, -JOY_RANGE, JOY_RANGE);
  return invert ? -offset : offset;
}

void renderJoystickEyes() {
  int pupilX = map(joyX, -JOY_RANGE, JOY_RANGE, -2, 2);
  int pupilY = map(joyY, -JOY_RANGE, JOY_RANGE, -3, 3);
  int shift = map(joyX, -JOY_RANGE, JOY_RANGE, -2, 2);
  byte tiles[4][8] = {};

  for (int y = 0; y < 16; y++) {
    for (int x = 0; x < 10; x++) {
      int margin = (y == 0 || y == 15) ? 3 :
                   ((y == 1 || y == 14) ? 1 : 0);
      bool eyeBody = (x >= margin && x < 10 - margin);

      bool gazeHighlight = abs(x - (4 + pupilX)) <= 1 &&
                           y >= 5 + pupilY && y <= 9 + pupilY;
      bool sparkle = (x == 2 && (y == 3 || y == 4)) ||
                     (x == 3 && y == 3) || (x == 7 && y == 12);
      if (eyeBody && !gazeHighlight && !sparkle) {
        byte tile = (y / 8) * 2 + x / 5;
        tiles[tile][y % 8] |= (1 << (4 - x % 5));
      }
    }
  }

  for (byte i = 0; i < 4; i++) lcd.createChar(i, tiles[i]);

  for (byte row = 0; row < 2; row++) {
    lcd.setCursor(0, row);
    lcd.print("                ");
    for (byte eye = 0; eye < 2; eye++) {
      int column = (eye == 0 ? 4 : 10) + shift;
      lcd.setCursor(column, row);
      lcd.write((uint8_t)(row * 2));
      lcd.write((uint8_t)(row * 2 + 1));
    }
  }
  lcd.setRGB(100, 200, 80);
  joystickDrawn = true;
  pettingDrawn = false;
  drawnX = joyX;
  drawnY = joyY;
}

void updateJoystick(unsigned long now) {
  if (now - lastJoystickSample < JOY_SAMPLE_MS) return;
  lastJoystickSample = now;
  int originalX = axisOffset(analogRead(JOY_X_PIN), joyCentreX, INVERT_JOY_X);
  int originalY = axisOffset(analogRead(JOY_Y_PIN), joyCentreY, INVERT_JOY_Y);
  joyX = -originalY;
  joyY = originalX;
  if (!petOn) return;

  bool moved = (joyX != 0 || joyY != 0);
  if (moved) {
    if (!joystickActive) {
      joystickActive = true;
      if (!pettingActive) startSound(sleeping ? SOUND_WAKE : SOUND_JOYSTICK);
      drawnX = 999;
      blinking = false;
      earsMoving = false; // Joystick interaction moves only the eyes.
    }
    sleeping = false;
    if (currentFace == SLEEPY) currentFace = NORMAL;
    lastMotionAt = now;
    lastJoystickActivity = now;
  }

  if (joystickActive && !moved &&
      now - lastJoystickActivity >= JOY_HOLD_MS) {
    joystickActive = false;
    lastFaceChange = now;
    lastBlink = now;
    blinking = false;
    if (!volumeScreen && !pettingActive) renderFace(currentFace);
  }
}

void updateTouch(unsigned long now) {
  bool reading = (digitalRead(TOUCH_PIN) == HIGH);
  if (reading != touchLastReading) {
    touchLastReading = reading;
    touchChangedAt = now;
  }

  if (now - touchChangedAt >= TOUCH_DEBOUNCE_MS && reading != touchStable) {
    touchStable = reading;
    if (touchStable && petOn) {
      touchStartedAt = now;
      if (havePreviousTap && now - previousTapAt <= DOUBLE_TAP_MS) {
        doubleTapBoost = true;
        doubleTapAt = now;
      }
      bool doubleTap = havePreviousTap && now - previousTapAt <= DOUBLE_TAP_MS;
      startSound(doubleTap ? SOUND_DOUBLE_PET : SOUND_PET);
      previousTapAt = now;
      havePreviousTap = true;
    }
  }

  if (!petOn) return;

  if (touchStable) {
    if (!pettingActive) {
      pettingActive = true;
      if (activeSound != SOUND_PET && activeSound != SOUND_DOUBLE_PET) {
        startSound(SOUND_PET);
      }
      petAnimationStartedAt = now;
      drawnHeartFrame = -1;
      blinking = false;
      earsMoving = false;
    }
    lastPetAt = now;
    lastMotionAt = now;
    sleeping = false;
    currentFace = HAPPY;
  }

  if (pettingActive && !touchStable && now - lastPetAt >= PET_LINGER_MS) {
    pettingActive = false;
    lastFaceChange = now;
    lastBlink = now;
    blinking = false;
    drawnX = 999; // Restore joystick eyes if the stick is still held.
    if (!volumeScreen && !joystickActive) renderFace(currentFace);
  }
}

void renderPetting(unsigned long now) {
  bool excited = (touchStable && now - touchStartedAt >= PET_HOLD_MS) ||
                (doubleTapBoost && now - doubleTapAt < 2000UL);
  unsigned long frameDuration = excited ? 180UL : 350UL;
  int frame = ((now - petAnimationStartedAt) / frameDuration) % 2;
  if (pettingDrawn && drawnHeartFrame == frame) return;

  const uint16_t large[16] = {
    0b0000000000, 0b0111001110, 0b1111111111, 0b1111111111,
    0b1111111111, 0b1111111111, 0b1111111111, 0b1111111111,
    0b1111111111, 0b0111111110, 0b0111111110, 0b0011111100,
    0b0001111000, 0b0000110000, 0b0000110000, 0b0000000000
  };
  const uint16_t small[16] = {
    0, 0, 0, 0b0011001100,
    0b0011111100, 0b0011111100, 0b0011111100, 0b0011111100,
    0b0001111000, 0b0001111000, 0b0000110000, 0b0000110000,
    0, 0, 0, 0
  };

  byte tiles[4][8] = {};
  for (byte y = 0; y < 16; y++) {
    uint16_t row = (frame == 0) ? small[y] : large[y];
    tiles[(y / 8) * 2][y % 8] = (row >> 5) & 31;
    tiles[(y / 8) * 2 + 1][y % 8] = row & 31;
  }
  for (byte i = 0; i < 4; i++) lcd.createChar(i, tiles[i]);

  for (byte row = 0; row < 2; row++) {
    lcd.setCursor(0, row);
    lcd.print("                ");
    lcd.setCursor(4, row);
    lcd.write((uint8_t)(row * 2));
    lcd.write((uint8_t)(row * 2 + 1));
    lcd.setCursor(10, row);
    lcd.write((uint8_t)(row * 2));
    lcd.write((uint8_t)(row * 2 + 1));
  }
  lcd.setRGB(255, frame == 0 ? 70 : 25, 110);
  pettingDrawn = true;
  joystickDrawn = false;
  drawnHeartFrame = frame;
}

// ---------- ON / standby ----------
void setPetPower(bool turnOn) {
  petOn = turnOn;
  pettingActive = false;
  havePreviousTap = false;
  doubleTapBoost = false;
  drawnHeartFrame = -1;
  joystickActive = false;
  earsMoving = false;
  blinking = false;
  volumeScreen = false;
  activeSound = SOUND_NONE;
  analogWrite(BUZZER_PIN, 0);

  if (petOn) {
    restEars();
    leftEar.attach(LEFT_EAR_PIN);
    rightEar.attach(RIGHT_EAR_PIN);
    lcd.display();
    lastMotionAt = millis();
    setSleeping(true, lastMotionAt); // Always start with sleepy face.
    startSound(SOUND_ON);
  } else {
    sleeping = true;
    leftEar.detach();
    rightEar.detach();
    lcd.noDisplay();
    lcd.setRGB(0, 0, 0);
  }
}

void updatePowerSwitch(unsigned long now) {
  int reading = digitalRead(POWER_SWITCH_PIN);
  if (reading != lastSwitchReading) {
    lastSwitchReading = reading;
    switchChangedAt = now;
  }
  if (now - switchChangedAt >= SWITCH_DEBOUNCE_MS &&
      reading != stableSwitchState) {
    stableSwitchState = reading;
    setPetPower(stableSwitchState == LOW);
  }
}

void setup() {
  pinMode(POWER_SWITCH_PIN, INPUT_PULLUP);
  pinMode(PIR_PIN, INPUT);
  pinMode(TOUCH_PIN, INPUT);
  pinMode(JOY_X_PIN, INPUT);
  pinMode(JOY_Y_PIN, INPUT);
  long totalX = 0, totalY = 0;
  for (byte i = 0; i < 16; i++) {
    totalX += analogRead(JOY_X_PIN);
    totalY += analogRead(JOY_Y_PIN);
  }
  joyCentreX = totalX / 16;
  joyCentreY = totalY / 16;
  pirPoweredAt = millis();
  pinMode(POT_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  analogWrite(BUZZER_PIN, 0);

  lcd.begin(16, 2);
  lcd.noDisplay();
  lcd.setRGB(0, 0, 0);
  lcd.createChar(0, openEye);
  lcd.createChar(1, closedEye);
  lcd.createChar(2, happyEye);
  lcd.createChar(3, smileLeft);
  lcd.createChar(4, smileMiddle);
  lcd.createChar(5, smileRight);
  lcd.createChar(6, roundMouth);

  byte fullBlock[8] = {31, 31, 31, 31, 31, 31, 31, 31};
  lcd.createChar(7, fullBlock);

  filteredPot = analogRead(POT_PIN);
  volumePercent = potToPercent(filteredPot);
  lastPotSample = millis();
  lastSwitchReading = digitalRead(POWER_SWITCH_PIN);
  stableSwitchState = lastSwitchReading;
  switchChangedAt = millis();
  setPetPower(stableSwitchState == LOW);
}

void loop() {
  unsigned long now = millis();
  updatePowerSwitch(now);
  now = millis();
  updateMotion(now);
  updateJoystick(now);
  updateTouch(now);
  updatePot(now);

  if (!petOn) {
    updateBuzzer(now);
    return;
  }

  updateEars(now);
  updateVolumeScreen(now);
  updateBuzzer(now);
  if (volumeScreen) return;

  if (pettingActive) {
    renderPetting(now);
    return;
  }
  if (joystickActive) {
    if (!joystickDrawn || joyX != drawnX || joyY != drawnY) {
      renderJoystickEyes();
    }
    return;
  }
  if (sleeping) return;

  updateBlink(now);
  if (now - lastFaceChange >= FACE_DURATION) {
    switch (currentFace) {
      case NORMAL: showFace(HAPPY); break;
      case HAPPY: showFace(SURPRISED); break;
      case SURPRISED: showFace(NORMAL); break;
      case SLEEPY: showFace(NORMAL); break;
    }
  }
}
