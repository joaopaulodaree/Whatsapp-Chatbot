const fs = require('fs');
const path = require('path');

const MESSAGES_PATH = path.resolve(__dirname, './bot_messages.json');

function getMessages() {
  return JSON.parse(fs.readFileSync(MESSAGES_PATH, 'utf8'));
}

function saveMessages(messages) {
  fs.writeFileSync(MESSAGES_PATH, JSON.stringify(messages, null, 2), 'utf8');
}

function getMessagesPath() {
  return MESSAGES_PATH;
}

module.exports = { getMessages, saveMessages, getMessagesPath };
