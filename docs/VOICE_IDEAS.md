# Voice Configuration Ideas

Research on VAPI voice options for healthcare scheduling assistant "Elise".

## How to Change the Voice

Edit `config/vapi-assistant.json` and update the `voice` section, then run:
```bash
pnpm run setup:vapi
```

This will update the assistant in VAPI with the new voice configuration.

## Current Voice (Too Flat)
- Provider: ElevenLabs
- Voice ID: `21m00Tcm4TlvDq8ikWAM` (Rachel)
- Issue: Too flat/bland for warm patient interactions

---

## Recommended Voices

### 1. Jessica Anne Bogart (ElevenLabs) - TOP PICK
| Attribute | Value |
|-----------|-------|
| **Provider** | `11labs` |
| **Voice ID** | `g6xIsTj2HwM6VR4iXFCw` |
| **Character** | Chatty, Friendly, Empathetic |
| **Why** | Explicitly recommended by ElevenLabs for healthcare/wellness. Empathetic and expressive. |
| **Settings** | `stability: 0.45`, `similarityBoost: 0.75` |

```json
"voice": {
  "provider": "11labs",
  "voiceId": "g6xIsTj2HwM6VR4iXFCw",
  "stability": 0.45,
  "similarityBoost": 0.75
}
```

---

### 2. Sarah (ElevenLabs)
| Attribute | Value |
|-----------|-------|
| **Provider** | `11labs` |
| **Voice ID** | `EXAVITQu4vr4xnSDxMaL` |
| **Character** | Confident, Warm, Professional |
| **Why** | Good balance of professionalism with warmth. Less flat than Rachel. |
| **Settings** | `stability: 0.55`, `similarityBoost: 0.75` |

```json
"voice": {
  "provider": "11labs",
  "voiceId": "EXAVITQu4vr4xnSDxMaL",
  "stability": 0.55,
  "similarityBoost": 0.75
}
```

---

### 3. Matilda (ElevenLabs)
| Attribute | Value |
|-----------|-------|
| **Provider** | `11labs` |
| **Voice ID** | `XrExE9yKIg1WjnnlVkGX` |
| **Character** | Warm, Clear, Audiobook Quality |
| **Why** | Natural prosody and pacing. Warmth baked into the voice model. |
| **Settings** | `stability: 0.50`, `similarityBoost: 0.70` |

```json
"voice": {
  "provider": "11labs",
  "voiceId": "XrExE9yKIg1WjnnlVkGX",
  "stability": 0.50,
  "similarityBoost": 0.70
}
```

---

### 4. Asteria (Deepgram Aura-2)
| Attribute | Value |
|-----------|-------|
| **Provider** | `deepgram` |
| **Voice ID** | `asteria` |
| **Character** | Professional, Natural, Enterprise-grade |
| **Why** | Fastest latency (<200ms). Better medical terminology. More cost-effective at scale. |

```json
"voice": {
  "provider": "deepgram",
  "voiceId": "asteria"
}
```

---

## Voice Settings Reference (ElevenLabs)

| Parameter | Range | Description |
|-----------|-------|-------------|
| **stability** | 0.0 - 1.0 | Lower (0.30-0.50) = more emotional/dynamic; Higher (0.60-0.85) = more consistent |
| **similarityBoost** | 0.0 - 1.0 | Higher = more clarity, recommended ~0.75 |
| **style** | 0.0 - 1.0 | Amplifies speaker style (increases latency if > 0) |
| **useSpeakerBoost** | boolean | Boosts similarity to original speaker |

---

## Comparison

| Voice | Warmth | Professionalism | Latency | Medical Terms |
|-------|--------|-----------------|---------|---------------|
| Jessica Anne Bogart | ⭐⭐⭐ | ⭐⭐ | Medium | Standard |
| Sarah | ⭐⭐⭐ | ⭐⭐⭐ | Medium | Standard |
| Matilda | ⭐⭐⭐ | ⭐⭐⭐ | Medium | Standard |
| Asteria (Deepgram) | ⭐⭐ | ⭐⭐⭐ | Fastest | Excellent |

---

## All Supported VAPI Voice Providers

| Provider | Config Value | Notes |
|----------|--------------|-------|
| ElevenLabs | `11labs` | Premium quality, 30+ languages, highly expressive |
| Deepgram | `deepgram` | Enterprise-grade, sub-200ms latency, 40+ voices |
| PlayHT | `playht` | 800+ voices, natural "um" and "ah" sounds |
| Azure | `azure` | 400+ voices, 140+ languages, emotion support |
| OpenAI | `openai` | OpenAI TTS voices |
| Google | `google` | Google Cloud TTS |
| LMNT | `lmnt` | Low latency voices |
| Rime AI | `rime-ai` | Conversational voices |
| Tavus | `tavus` | Video-focused TTS |
| Cartesia | `cartesia` | Custom voice cloning |
| Neets | `neets` | Alternative TTS |
| Custom | `custom-voice` | Bring your own provider |

---

## Finding Voice IDs

### ElevenLabs
1. Go to [ElevenLabs Voice Library](https://elevenlabs.io/voice-library)
2. Search for voices by use case (e.g., "healthcare", "friendly")
3. Click on a voice to see its Voice ID
4. Or use their API: `GET https://api.elevenlabs.io/v1/voices`

### Deepgram Voices (VAPI format)
- `asteria` - Female, professional
- `luna` - Female, warm
- `stella` - Female, clear
- `athena` - Female, confident
- `hera` - Female, mature
- `orion` - Male, professional
- `arcas` - Male, warm
- `perseus` - Male, clear
- `angus` - Male, Irish accent
- `orpheus` - Male, deep

### PlayHT
- Browse voices at [PlayHT Voice Library](https://play.ht/voice-library/)
- Voice IDs are available in their dashboard

---

## Resources

- [VAPI Voice Configuration Docs](https://docs.vapi.ai/customization/voice)
- [ElevenLabs Voice Library](https://elevenlabs.io/voice-library)
- [ElevenLabs Voice Settings Guide](https://elevenlabs.io/docs/speech-synthesis/voice-settings)
- [Deepgram Aura-2 Voices](https://developers.deepgram.com/docs/tts-models)
- [PlayHT Voice Library](https://play.ht/voice-library/)

---

## Tips for Healthcare Voice AI

1. **Warmth over efficiency** - Patients prefer voices that sound caring, even if slightly slower
2. **Lower stability** (0.40-0.50) makes voices more expressive and less robotic
3. **Test with real scenarios** - Medical terms, appointment times, patient names
4. **Consider latency** - Deepgram is fastest if conversation flow feels sluggish
5. **Accessibility** - Clear enunciation matters for older patients or those hard of hearing
