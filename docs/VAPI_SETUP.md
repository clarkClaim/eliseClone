# VAPI Setup Guide

Quick-start guide for configuring VAPI voice AI for the Elise scheduling assistant.

---

## Prerequisites

- Node.js and pnpm installed
- Project dependencies installed (`pnpm install`)
- Local server running on port 3000

---

## 1. Create a VAPI Account

1. Go to [dashboard.vapi.ai](https://dashboard.vapi.ai)
2. Sign up with email or OAuth
3. Complete the onboarding flow

---

## 2. Get Your API Keys

1. In the VAPI dashboard, click **API Keys** from the left sidebar (or visit [dashboard.vapi.ai/org/api-keys](https://dashboard.vapi.ai/org/api-keys))
2. Copy your **Private API Key** - this is used for server-side operations
3. Add it to your `.env` file:

```bash
VAPI_API_KEY=your-private-api-key-here
```

> **Note:** The private key is for backend use. The public key is only needed for web-based calls.

---

## 3. Set Up ngrok for Local Development

VAPI requires HTTPS webhooks to send tool call requests. For local development, use ngrok to create a secure tunnel.

### Install ngrok

```bash
# macOS
brew install ngrok

# Or download from https://ngrok.com/download
```

### Create a tunnel

```bash
ngrok http 3000
```

You'll see output like:

```
Forwarding    https://abc123.ngrok-free.app -> http://localhost:3000
```

### Set the SERVER_URL

Copy the HTTPS URL and add it to your `.env`:

```bash
SERVER_URL=https://abc123.ngrok-free.app
```

> **Tip:** For a persistent URL, create a free ngrok account and use a static domain:
> ```bash
> ngrok http --domain your-domain.ngrok-free.app 3000
> ```

---

## 4. Create the VAPI Assistant

Run the setup script to create or update your assistant:

```bash
pnpm run setup:vapi
```

The script reads `config/vapi-assistant.json` and creates an assistant in VAPI.

On first run, you'll see:

```
Assistant created successfully!
  ID: asst_abc123xyz
  Name: Elise Patient Assistant

Add this to your .env file:
  VAPI_ASSISTANT_ID=asst_abc123xyz
```

Add the assistant ID to your `.env`:

```bash
VAPI_ASSISTANT_ID=asst_abc123xyz
```

---

## 5. Buy and Configure a Phone Number

### Buy a number

1. In the VAPI dashboard, go to **Phone Numbers** in the left sidebar
2. Click **Create Phone Number**
3. Select "Vapi" as the provider (free US numbers available)
4. Choose an area code and confirm

### Link to your assistant

1. Click on your new phone number
2. In **Inbound Settings**, select your assistant ("Elise Patient Assistant")
3. Save changes

When someone calls this number, VAPI will connect them to your assistant.

---

## 6. Test the Integration

### Start your local server

```bash
pnpm run dev
```

### Ensure ngrok is running

```bash
ngrok http 3000
```

### Call your VAPI number

1. Dial the phone number you configured
2. You should hear: "Hello, this is Elise from the clinic..."
3. Provide a phone number and date of birth
4. The assistant will call your `/vapi/tools` endpoint to identify the patient

### Debug with ngrok inspector

Open [localhost:4040](http://localhost:4040) to see incoming webhook requests from VAPI.

---

## Environment Variables Summary

```bash
# .env
VAPI_API_KEY=your-private-api-key
VAPI_ASSISTANT_ID=asst_your-assistant-id
SERVER_URL=https://your-domain.ngrok-free.app
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Invalid Key" error | Verify you're using the private key, not public |
| Webhooks not received | Check ngrok is running and SERVER_URL is correct |
| Assistant not answering | Verify phone number is linked to assistant in dashboard |
| Tool calls failing | Check server logs and ngrok inspector for errors |

---

## Resources

- [VAPI Documentation](https://docs.vapi.ai/)
- [VAPI Dashboard](https://dashboard.vapi.ai)
- [ngrok Documentation](https://ngrok.com/docs)
