import base64
import io
import json
import os
import sys
import traceback
import wave


MODEL_ID = os.environ.get("SPEECHBRAIN_MODEL", "speechbrain/spkrec-ecapa-voxceleb")
THRESHOLD = float(os.environ.get("SPEECHBRAIN_THRESHOLD", "0.65"))

classifier = None
enrolled_embedding = None


def write(payload):
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def ensure_model():
    global classifier
    if classifier is not None:
        return

    import torch  # noqa: F401
    import torchaudio  # noqa: F401

    try:
        from speechbrain.inference.speaker import EncoderClassifier
    except ImportError:
        from speechbrain.pretrained import EncoderClassifier
    from speechbrain.utils.fetching import LocalStrategy

    classifier = EncoderClassifier.from_hparams(
        source=MODEL_ID,
        savedir=os.path.join("models", "speechbrain", MODEL_ID.replace("/", "_")),
        local_strategy=LocalStrategy.COPY,
        run_opts={"device": os.environ.get("SPEECHBRAIN_DEVICE", "cpu")},
    )


def load_waveform(audio_b64):
    import numpy as np
    import torch
    import torchaudio

    raw = base64.b64decode(audio_b64)
    with wave.open(io.BytesIO(raw), "rb") as wav:
        channels = wav.getnchannels()
        sample_rate = wav.getframerate()
        sample_width = wav.getsampwidth()
        frames = wav.readframes(wav.getnframes())

    if sample_width != 2:
        raise ValueError("SpeechBrain speaker identity expects 16-bit PCM WAV audio.")

    samples = np.frombuffer(frames, dtype=np.int16).astype("float32") / 32768.0
    if channels > 1:
        samples = samples.reshape(-1, channels).mean(axis=1)

    waveform = torch.from_numpy(samples)

    if sample_rate != 16000:
        waveform = torchaudio.functional.resample(waveform.unsqueeze(0), sample_rate, 16000).squeeze(0)

    if waveform.numel() < 16000:
        raise ValueError("Need at least one second of clear speech for speaker identity.")

    peak = torch.max(torch.abs(waveform))
    if peak > 0:
        waveform = waveform / peak

    return waveform


def embed(audio_b64):
    import torch

    ensure_model()
    waveform = load_waveform(audio_b64)

    with torch.no_grad():
        embedding = classifier.encode_batch(waveform.unsqueeze(0)).squeeze()
        embedding = torch.nn.functional.normalize(embedding, dim=0)
        return embedding


def handle_enroll(payload):
    global enrolled_embedding
    enrolled_embedding = embed(payload["audio"])
    return {
        "ok": True,
        "enrolled": True,
        "model": MODEL_ID,
        "threshold": THRESHOLD,
    }


def handle_verify(payload):
    import torch

    if enrolled_embedding is None:
        raise ValueError("No enrolled speaker. Calibrate your voice first.")

    candidate = embed(payload["audio"])
    score = torch.nn.functional.cosine_similarity(enrolled_embedding, candidate, dim=0).item()
    return {
        "ok": True,
        "score": score,
        "threshold": THRESHOLD,
        "speaker": "me" if score >= THRESHOLD else "them",
    }


def handle_clear(_payload):
    global enrolled_embedding
    enrolled_embedding = None
    return {"ok": True, "enrolled": False}


def main():
    write({"type": "ready"})

    handlers = {
        "enroll": handle_enroll,
        "verify": handle_verify,
        "clear": handle_clear,
    }

    for line in sys.stdin:
        if not line.strip():
            continue

        try:
            payload = json.loads(line)
            request_id = payload.get("id")
            request_type = payload.get("type")
            if request_type not in handlers:
                raise ValueError(f"Unknown request type: {request_type}")

            response = handlers[request_type](payload)
            response["id"] = request_id
            write(response)
        except Exception as error:
            traceback.print_exc(file=sys.stderr)
            write({
                "id": payload.get("id") if "payload" in locals() else None,
                "ok": False,
                "error": str(error),
            })


if __name__ == "__main__":
    main()
