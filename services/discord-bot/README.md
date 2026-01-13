# Discord Bot Service

Production-ready Discord bot with modular architecture.

## Architecture

```
src/
├── config/           # Configuration & constants
│   ├── constants.js  # All bot settings, messages, khodam data
│   ├── env.js        # Environment variable validation
│   └── index.js      # Config exports
├── middleware/       # Processing layers
│   ├── security.js   # Block @everyone, @role mentions
│   ├── logger.js     # Colored console + file logging
│   └── index.js      # Middleware exports
├── commands/         # Command modules
│   ├── khodam.js     # !khodam command
│   ├── search.js     # !search (disabled)
│   └── index.js      # Command auto-loader
└── handlers/         # Event handlers
    └── handleMessage.js
```

## Quick Start

```bash
# Install dependencies
npm install

# Create .env file
echo "TOKEN=your_discord_token" > .env

# Run bot
npm start

# Development (auto-reload)
npm run dev
```

## Adding New Commands

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

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TOKEN`  | Yes      | Discord bot token |
| `API_KEY`| No       | OpenAI API key (for future AI features) |
| `DEBUG`  | No       | Enable debug logging |

## Security

- Blocks `@everyone` / `@here` mentions globally
- Blocks role mentions globally
- Ignores bot messages
- Graceful shutdown on SIGINT/SIGTERM
