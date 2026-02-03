# Discord Bot Service v2.1

Production-ready Discord bot with AI-powered conversations and vision capabilities.

## 🎉 What's New in v2.1

- ✅ **Migrated to WinterCode AI API** - Faster, more reliable, supports images
- ✅ **Image & Sticker Reading** - Bot can now see and analyze images/stickers
- ✅ **Reply Context Awareness** - Bot understands conversation context when you reply to messages
- ✅ **Enhanced Message Handling** - Better conversation flow with context preservation

## 🚀 Features

### AI Chat with Prefix
- Use `zra` or `ezra` prefix to talk to the bot in servers
- Example: `zra apa kabar?` or `ezra ini artinya apa`

### Direct Messages
- DM the bot directly without any prefix
- Works with text and images

### Image & Sticker Reading
- Send an image with: `zra ini artinya apa`
- Reply to an image with: `zra jelaskan gambar ini`
- Bot can analyze stickers too!

### Reply Context Awareness
- When you reply to someone's message and ask the bot, it knows the context
- Example: Replying to "zra dia kenapa" with "kontol" - the bot understands who "dia" refers to

### Help Channels
- Automatic AI responses in designated help channels (no prefix needed)

## 📋 Quick Start

```bash
# Install dependencies
npm install

# Run bot
npm start

# Development mode (auto-reload)
npm run dev
```

## ⚙️ Configuration

Create a `.env` file:

```env
# Discord Bot Token (required)
TOKEN=your_discord_bot_token

# WinterCode AI API (Primary AI provider)
WINTERCODE_API_KEY=xxhengkerpromax
WINTERCODE_MODEL=gemini-2.5-flash
```

### Available AI Models

- `gemini-2.5-flash-lite` - Fastest, cheapest (good for simple queries)
- `gemini-2.5-flash` - Standard model (balanced)
- `gemini-3-pro-preview` - Advanced reasoning
- `gemini-3-pro-image-preview` - Best for image analysis

## 🏗️ Architecture

```
src/
├── config/           # Configuration & constants
│   ├── constants.js  # Bot settings, messages, AI prefixes
│   ├── env.js        # Environment validation
│   └── index.js      # Config exports
├── middleware/       # Processing layers
│   ├── security.js   # Block @everyone, @role mentions
│   ├── logger.js     # Colored console + file logging
│   └── index.js      # Middleware exports
├── commands/         # Command modules
│   ├── khodam.js     # !khodam (disabled)
│   ├── search.js     # !search (disabled)
│   └── index.js      # Command auto-loader
├── handlers/         # Event handlers
│   └── handleMessage.js  # Enhanced with context & vision
├── services/         # External services
│   ├── wintercodeClient.js  # WinterCode AI API
│   ├── aiClient.js   # Legacy OpenAI (unused)
│   └── ragService.js # RAG knowledge base (unused)
└── slashCommands/    # Discord slash commands
```

## 💬 Usage Examples

### Text Chat
```
User: zra apa kabar?
Bot: Kabar baik! Bagaimana denganmu?

User: ezra jelasin tentang AI
Bot: [Explains AI in Indonesian]
```

### Image Analysis
```
User: [uploads image] zra ini gambar apa?
Bot: [Analyzes and describes the image]
```

### Reply Context
```
Friend: Kenapa hari ini hujan terus?
User: [replying] zra jawab dia
Bot: [Answers the friend's question about rain]
```

### Sticker Reading
```
User: [sends sticker] zra stiker ini artinya apa?
Bot: [Analyzes and explains the sticker]
```

## 🔒 Security

- Blocks `@everyone` / `@here` mentions globally
- Blocks role mentions globally
- Filters Discord invite links from AI responses
- Ignores bot messages
- Graceful shutdown on SIGINT/SIGTERM

## 🛠️ Adding New Commands

1. Create `src/commands/yourcommand.js`:

```javascript
const meta = {
    name: 'yourcommand',
    aliases: ['yc', 'alias'],
    description: 'What it does',
    usage: '!yourcommand <args>',
};

async function execute(message, args) {
    // Your logic here
    return message.reply('Hello!');
}

module.exports = { meta, execute };
```

2. Command is auto-loaded! No registration needed.

## 📊 API Details

### WinterCode API

**Endpoint:** `https://ai.wintercode.dev/v1/messages`

**Text Request:**
```json
{
  "model": "gemini-2.5-flash",
  "messages": [
    {
      "role": "user",
      "content": "Hello!"
    }
  ],
  "temperature": 0.7,
  "max_output_tokens": 2000
}
```

**Vision Request (Image):**
```json
{
  "model": "gemini-3-pro-image-preview",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "image",
          "source": {
            "type": "base64",
            "media_type": "image/png",
            "data": "iVBORw0KGgo..."
          }
        },
        {
          "type": "text",
          "text": "Describe this image"
        }
      ]
    }
  ],
  "temperature": 0.7,
  "max_output_tokens": 2000
}
```

## 🐛 Troubleshooting

### Bot not responding
- Check if `TOKEN` is correct in `.env`
- Verify `WINTERCODE_API_KEY` is set
- Check bot logs with `DEBUG=true npm start`

### Images not working
- Ensure the model supports vision (use `gemini-3-pro-image-preview`)
- Check if image URL is accessible
- Verify image format (PNG, JPG, GIF, WebP supported)

### Context not working
- Make sure you're actually replying to a message
- Check if the message has content to reference

## 📝 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TOKEN` | Yes | Discord bot token |
| `WINTERCODE_API_KEY` | Yes | WinterCode API key (default: xxhengkerpromax) |
| `WINTERCODE_MODEL` | No | AI model to use (default: gemini-2.5-flash) |
| `DEBUG` | No | Enable debug logging |
| `LOG_FILE` | No | Path to log file |

## 🤝 Contributing

Feel free to submit issues and enhancement requests!

## 📄 License

MIT License - Feel free to use this bot for your own projects!
