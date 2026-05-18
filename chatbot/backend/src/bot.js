'use strict';

const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { setBotConnected, setBotEnabled, getBotStatus } = require('./store');
const { getContactData, registerDemand } = require('./services/demand.service');
const { getMessages } = require('./messages');
const { ConversationStateMachine } = require('./conversation/state-machine');
const { SessionStore } = require('./conversation/session-store');
const db = require('./db/connection');
const { csvManager, aiReplyService } = require('./shared');

let clientInstance = null;
let botStartedAt = null;
let currentQrString = null;

const aiService = {
  async getReply(name, question) {
    if (!aiReplyService) throw new Error('GROQ_API_KEY não configurada');
    const { clients } = csvManager.search(name, { limit: 1 });
    if (clients.length === 0) throw new Error('Cliente não encontrado');
    return aiReplyService.getReply({ client: clients[0], userRequest: question });
  },
};

const demandService = { registerDemand };
const sessionStore = new SessionStore(db);
const messageStore = { get: getMessages };

const stateMachine = new ConversationStateMachine({
  aiService,
  demandService,
  sessionStore,
  messageStore,
});

// Evict stale sessions every hour
setInterval(() => sessionStore.evictStale(), 60 * 60 * 1000).unref();

function toMessage(msg, contact) {
  return {
    from: msg.from,
    body: msg.body || '',
    hasMedia: !!(msg.hasMedia || msg.type === 'image' || msg.type === 'document' || msg.type === 'sticker'),
    contact,
  };
}

function handleBotEvents(client) {
  client.on('qr', (qr) => {
    currentQrString = qr;
    setBotConnected(false);
    console.log('QR recebido. Escaneie com o WhatsApp.');
    qrcode.generate(qr, { small: true });
  });

  client.on('authenticated', () => {
    currentQrString = null;
    console.log('AUTHENTICATED');
  });

  client.on('ready', () => {
    currentQrString = null;
    console.log('READY');
    setBotConnected(true);
    botStartedAt = Math.floor(Date.now() / 1000);
  });

  client.on('auth_failure', (msg) => {
    currentQrString = null;
    console.error('AUTHENTICATION FAILURE', msg);
    setBotConnected(false);
  });

  client.on('disconnected', (reason) => {
    currentQrString = null;
    console.log('DISCONNECTED', reason);
    setBotConnected(false);
  });

  client.on('message', async (msg) => {
    const status = getBotStatus();
    if (!status.botEnabled) return;

    try {
      if (botStartedAt && msg.timestamp < botStartedAt) return;
      if (msg.fromMe) return;

      const from = msg.from;
      if (
        msg.isStatus ||
        msg.broadcast ||
        from === 'status@broadcast' ||
        from.endsWith('@broadcast') ||
        from.endsWith('@g.us') ||
        from.endsWith('@newsletter')
      ) return;

      const contact = await getContactData(msg);
      const replies = await stateMachine.handle(toMessage(msg, contact));
      for (const reply of replies) await msg.reply(reply);
    } catch (error) {
      console.error('Error handling message:', error);
      try {
        const msgs = getMessages();
        await msg.reply(msgs.generic_error);
      } catch (replyError) {
        console.error('Error sending fallback message:', replyError);
      }
    }
  });
}

function createClient() {
  const baseDataDir = process.env.APP_DATA_DIR || path.resolve(__dirname, '../data');
  const waAuthDir = path.join(baseDataDir, 'wwebjs_auth');

  const client = new Client({
    authStrategy: new LocalAuth({
      dataPath: waAuthDir,
      clientId: 'souarte-bot',
    }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });
  handleBotEvents(client);
  return client;
}

async function startBot() {
  if (clientInstance) {
    console.log('Bot já foi iniciado. Ignorando nova inicialização.');
    return clientInstance;
  }

  clientInstance = createClient();
  setBotEnabled(true);

  await clientInstance.initialize();
  console.log('Inicialização do bot disparada com sucesso.');

  return clientInstance;
}

async function stopBot() {
  if (!clientInstance) {
    console.log('Bot já está desligado.');
    return;
  }

  const current = clientInstance;
  clientInstance = null;
  botStartedAt = null;
  currentQrString = null;

  await current.destroy().catch((err) => console.error('Erro ao destruir bot:', err));
  setBotEnabled(false);
  setBotConnected(false);
  console.log('Bot desligado com sucesso.');
}

function getBotQr() {
  return currentQrString;
}

function getBotClient() {
  return clientInstance;
}

module.exports = {
  startBot,
  stopBot,
  getBotClient,
  getBotQr,
};
