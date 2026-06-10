# Safety-First Real-Time Description

The WebSocket endpoint `/ws/realtime-description` processes browser camera
frames through:

```text
quality check -> change detection -> pretrained YOLO -> risk rules
              -> Gemini only when needed -> concise Vietnamese speech
```

Each WebSocket connection owns its previous frame and processing state. The
backend keeps the existing `text` response field and also returns
`speech_output`, `risk_level`, detections, change ratio, and Gemini reasons.

Default thresholds:

- Dark or blurry frames are never blocked. Quality scores are returned only as
  metadata through `frame_quality.warning`.
- No meaningful change: `change_ratio < 0.08`.
- Strong scene change: `change_ratio >= 0.15`.
- Official YOLO detections: confidence `>= 0.40`.
- Gemini uncertainty signal: important detection confidence `0.30-0.50`.

The default pretrained model is `yolo11n.pt`. Ultralytics downloads it on first
use when it is not available locally. Configure `YOLO_MODEL_PATH` to use a
prepared local model instead.

Example frame request:

```json
{
  "type": "frame",
  "data": "base64-jpeg",
  "question": "Tôi có thể đi tiếp không?"
}
```

Clear high or moderate risks are returned immediately using rule-based speech
without waiting for Gemini.

To keep automatic descriptions responsive, strong scene change alone does not
call Gemini unless multiple important objects are present. Three or more
official detections with confidence at least `0.40` automatically request a
Gemini description. Automatic Gemini calls have a default 5-second cooldown.
Explicit user questions bypass the cooldown.

Set `REALTIME_DEBUG_LOGS=true` to log each processing stage without logging
image data or user questions. Successful YOLO execution produces log entries
containing `YOLO inference completed`, followed by the detected classes,
confidence, position, and area ratio.
