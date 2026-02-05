## 1. Model Variant Configs

- [ ] 1.1 Create `test-model-gpt4o.json` - baseline with gpt-4o, Deepgram asteria
- [ ] 1.2 Create `test-groq-maverick.json` - Groq llama-4-maverick (~200ms LLM latency)
- [ ] 1.3 Create `test-groq-llama3.json` - Groq llama-3.3-70b-versatile
- [ ] 1.4 Create `test-claude-haiku.json` - Claude 3.5 Haiku (fast + smart)
- [ ] 1.5 Create `test-claude-sonnet.json` - Claude 3.5 Sonnet (best instructions)
- [ ] 1.6 Create `test-gemini-flash.json` - Google Gemini 2.0 Flash

## 2. Voice & Special Variant Configs

- [ ] 2.1 Create `test-voice-jessica.json` - 11Labs Jessica Anne (warm voice)
- [ ] 2.2 Create `test-voice-orion.json` - Deepgram Orion (male voice)
- [ ] 2.3 Create `test-tools-unified.json` - unified manage_appointment tool
- [ ] 2.4 Create `test-ultra-fast.json` - Groq Maverick + Deepgram Luna + minimal delays

## 3. Deployment & Verification

- [ ] 3.1 Run `pnpm run vapi:setup` to deploy all test assistants
- [ ] 3.2 Run `pnpm run vapi:list` to verify all 10 test assistants appear
- [ ] 3.3 Test assignment with `pnpm run vapi:assign` to a phone number
