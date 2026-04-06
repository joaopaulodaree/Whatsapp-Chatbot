const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { setBotConnected, setBotEnabled, getBotStatus } = require('./store');
const { registerDemandFromMessage, getContactData } = require('./services/demand.service');
const { getMessages } = require('./messages');

const TEST_NUMBERS = ['118244862099469@lid', '226860222951446@lid', '553198188053@c.us'];
const sessions = new Map();

let clientInstance = null;
let botStartedAt = null;
let currentQrString = null;

async function getAiResponse(query, userRequest) {
  const response = await fetch('http://localhost:3001/api/ai-response', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      q: query,
      request: userRequest,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error || 'Erro ao consultar a API');
  }

  return data.answer;
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
      const from = msg.from;

      const { whatsappId, phone, pushName } = await getContactData(msg);

      console.log({
        whatsappId,
        phone,
        pushName,
        body: msg.body,
      });

      if (botStartedAt && msg.timestamp < botStartedAt) {
        return;
      }

      if (!TEST_NUMBERS.includes(from)) return;
      if (msg.fromMe) return;

      if (
        msg.isStatus ||
        msg.broadcast ||
        from === 'status@broadcast' ||
        from.endsWith('@broadcast') ||
        from.endsWith('@g.us') ||
        from.endsWith('@newsletter')
      ) {
        return;
      }

      if (!msg.body || typeof msg.body !== 'string') return;

      const rawBody = msg.body.trim();
      const body = rawBody.toLowerCase();

      const msgs = getMessages();

      if (!sessions.has(from)) {
        sessions.set(from, { step: 'menu', data: {} });
        await msg.reply(msgs.greeting + '\n' + msgs.menu_options);
        return;
      }

      const session = sessions.get(from);

      if (body === 'menu') {
        session.step = 'menu';
        session.data = {};
        sessions.set(from, session);
        await msg.reply(msgs.menu_label + '\n' + msgs.menu_options);
        return;
      }

      if (session.step === 'menu') {
        if (body === '1') {
          session.step = 'crediario_nome';
          session.data = {};
          sessions.set(from, session);
          await msg.reply(msgs.crediario_nome_request);
          return;
        }

        if (body === '2') {
          session.step = 'vendedora';
          sessions.set(from, session);
          await msg.reply(msgs.vendedora_question);
          return;
        }

        await msg.reply(msgs.invalid_option);
        return;
      }

      if (session.step === 'crediario_nome') {
        session.data.name = rawBody;
        session.step = 'crediario_duvida';
        sessions.set(from, session);
        await msg.reply(msgs.crediario_duvida_request);
        return;
      }

      if (session.step === 'crediario_duvida') {
        session.data.userRequest = rawBody;
        sessions.set(from, session);

        try {
          const answer = await getAiResponse(session.data.name, session.data.userRequest);
          await msg.reply(answer);
        } catch (error) {
          console.error('Erro ao consultar API:', error);
          await msg.reply(msgs.crediario_error);
        }

        session.step = 'crediario_continue';
        sessions.set(from, session);
        await msg.reply(msgs.crediario_continue_question);
        return;
      }

      if (session.step === 'crediario_new_duvida') {
        session.data.userRequest = rawBody;
        sessions.set(from, session);

        try {
          const answer = await getAiResponse(session.data.name, session.data.userRequest);
          await msg.reply(answer);
        } catch (error) {
          console.error('Erro ao consultar API:', error);
          await msg.reply(msgs.crediario_error);
        }

        session.step = 'crediario_continue';
        sessions.set(from, session);
        await msg.reply(msgs.crediario_continue_question);
        return;
      }

      if (session.step === 'crediario_continue') {
        if (body === 'sim') {
          session.step = 'crediario_new_duvida';
          sessions.set(from, session);
          await msg.reply(msgs.crediario_new_duvida_request);
          return;
        }

        if (body === 'não' || body === 'nao') {
          await msg.reply(msgs.final_prompt);
          session.step = 'final';
          sessions.set(from, session);
          return;
        }

        await msg.reply(msgs.yes_or_no);
        return;
      }

      if (session.step === 'vendedora') {
        if (body === 'sim') {
          await msg.reply(msgs.vendedora_contacts);
          session.step = 'final';
          sessions.set(from, session);
          return;
        }

        if (body === 'não' || body === 'nao') {
          await msg.reply(msgs.vendedora_wait);
          await registerDemandFromMessage(msg, {
            type: 'vendedora',
            description: 'Cliente deseja falar com uma vendedora',
          });
          session.step = 'final';
          sessions.set(from, session);
          return;
        }

        await msg.reply(msgs.yes_or_no);
        return;
      }

      if (session.step === 'orcamento') {
        await msg.reply(msgs.orcamento_confirm);
        session.step = 'final';
        sessions.set(from, session);
        return;
      }

      if (session.step === 'produtos') {
        await msg.reply(msgs.produtos_confirm);
        session.step = 'final';
        sessions.set(from, session);
        return;
      }

      if (session.step === 'final') {
        await msg.reply(msgs.final_prompt);
        return;
      }
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
  const client = new Client({
    authStrategy: new LocalAuth(),
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
