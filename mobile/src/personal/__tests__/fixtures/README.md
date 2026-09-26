# Test fixtures

`mediapipe_hands.json` holds landmark frames (feature spec v1, 3 decimals)
produced by this app's camera engine (`engine/engine.ts`, MediaPipe Tasks
Vision 1.0.1) running in Chromium on composite test images: a person photo
with a hand photo pasted in front of the chest, slightly moved and scaled per
frame. It lets the tests check recognition on real tracking output.

- Hand photos: MediaPipe test images `victory.jpg`, `fist.jpg`,
  `thumb_up.jpg`, `pointing_up.jpg` (google-ai-edge/mediapipe, Apache-2.0).
- Person photo: Grace Hopper portrait (U.S. Navy, public domain), as shipped
  in matplotlib's sample data.

Only numbers are stored, no images. The handshapes are **not ISL signs**; they
are simply distinct real handshapes.
