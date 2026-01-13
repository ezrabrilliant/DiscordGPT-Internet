# discordgpt-Internet
discord bot which has AI chat features such as chatgpt, and connects to the internet to access deeper information


## Installation
1. Clone the repository
2. Install the requirements using `npm install axios dotenv googleapis discord.js openai`
3. Create a `.env` file and add the following which you can get from the OpenAI API:
```env
OPENAI_API_KEY=your-api-key
DISCORD_TOKEN=your-discord-token
BRAVE_KEY=your-brave-token
GOOGLE_API_KEY=your-google-token
GOOGLE_SEARCH_ID=your-google-id
```
4. Run the bot using `node main.js`
5. Enjoy!

## Usage
The bot has a few commands which you can use to interact with it:
- `zra/ezra <message>`: Chat with the AI
- `!google <query>`: Search a web using Google
- `!image <query>`: Search image using Brave


## Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## Acknowledgements
- [OpenAI](https://openai.com)
- [Google](https://google.com)
- [Discord.js](https://discord.js.org)
- [Axios](https://axios-http.com)
- [Dotenv](https://www.npmjs.com/package/dotenv)
- [Brave](https://brave.com)