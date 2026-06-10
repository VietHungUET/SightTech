# Voice Command Backend

The backend voice command pipeline is:

```text
Audio -> ASR -> normalization -> hybrid intent routing -> action execution
      -> Redis state update -> feedback_text
```

Routing uses stable domains and general operations rather than enumerating every
possible user request. Open-ended follow-ups such as summarizing, translating,
extracting key points, or explaining a previous document are represented as:

```json
{
  "domain": "text_recognition",
  "operation": "process_previous_result",
  "instruction": "The user's original request",
  "context_reference": "text_recognition"
}
```

Redis keys:

- `sighttech:voice:session:{session_id}`: current conversation state.
- `sighttech:voice:session:{session_id}:turns`: capped recent turn history.

Redis is required for command execution. Configure `REDIS_URL`; the API returns
HTTP 503 when conversation state cannot be read or persisted.

Start the repository-managed Redis container from the repository root:

```powershell
docker compose up -d redis
docker compose ps
```

The backend runs outside Docker and connects through
`REDIS_URL=redis://localhost:6379/0`. Redis persists its AOF data in the Docker
named volume `sighttech-redis-data`. Session keys still expire according to
`VOICE_SESSION_TTL_SECONDS`.

Stop Redis without deleting data:

```powershell
docker compose stop redis
```

Use `docker compose down` to remove the container while retaining the named
volume. Do not use `docker compose down -v` unless the Redis data should be
deleted.

Endpoints:

- `POST /voice-command/text`: route and execute an existing transcript.
- `POST /voice-command/audio`: run ASR, then route and execute the transcript.
- `POST /transcribe_audio_v2`: compatibility endpoint using the same router.

The new endpoints require a unique `session_id`. The compatibility endpoint
keeps its existing default session behavior.

`feedback_text` is concise text suitable for speech output. The voice command
backend does not generate TTS audio; clients or a later TTS layer can speak it.
