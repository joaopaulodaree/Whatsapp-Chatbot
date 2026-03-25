const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { setBotConnected } = require('./store');
const TEST_NUMBERS = ['118244862099469@lid', '226860222951446@lid'];

const sessions = new Map();

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => {
    console.log('QR recebido. Escaneie com o WhatsApp.');
    qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
    console.log('AUTHENTICATED');
});

client.on('ready', () => {
    console.log('READY');
    setBotConnected(true);
});

client.on('auth_failure', (msg) => {
    console.error('AUTHENTICATION FAILURE', msg);
    setBotConnected(false);
});

client.on('disconnected', (reason) => {
    console.log('DISCONNECTED', reason);
    setBotConnected(false);
});

client.on('message', async (msg) => {
    try {
        const from = msg.from;

        
        console.log({
            from: msg.from,
            fromMe: msg.fromMe,
            isStatus: msg.isStatus,
            broadcast: msg.broadcast,
            type: msg.type,
            body: msg.body
        });
        
        if (!TEST_NUMBERS.includes(from)) {
            return;
        }

        // Ignora mensagens enviadas pela própria conta
        if (msg.fromMe) {
            return;
        }

        // Ignora status, broadcasts, grupos e canais/newsletters
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

        // Ignora mensagens sem texto
        if (!msg.body || typeof msg.body !== 'string') {
            return;
        }

        const body = msg.body.trim().toLowerCase();

        if (!sessions.has(from)) {
            sessions.set(from, { step: 'menu', data: {} });

            await msg.reply(
                'Olá. Somos a Souarte Nova Era! Por favor, escolha uma opção abaixo para agilizarmos seu atendimento:' +
                '\n1. Checar crediário' +
                '\n2. Fazer um orçamento' +
                '\n3. Informações sobre produtos' +
                '\n4. Falar com uma vendedora'
            );
            return;
        }

        const session = sessions.get(from);

        if (body === 'menu') {
            session.step = 'menu';
            sessions.set(from, session);

            await msg.reply(
                'Menu principal:' +
                '\n1. Checar crediário' +
                '\n2. Fazer um orçamento' +
                '\n3. Informações sobre produtos' +
                '\n4. Falar com uma vendedora'
            );
            return;
        }

        if (session.step === 'menu') {
            if (body === '1') {
                session.step = 'crediario';
                sessions.set(from, session);

                await msg.reply('Por favor, informe seu nome ou CPF para checarmos seu crediário.');
                return;
            }

            if (body === '2') {
                session.step = 'orcamento';
                sessions.set(from, session);

                await msg.reply('Por favor, nos dê mais detalhes sobre o orçamento que deseja solicitar.');
                return;
            }

            if (body === '3') {
                session.step = 'produtos';
                sessions.set(from, session);

                await msg.reply('Por favor, nos informe qual produto você gostaria de saber mais informações.');
                return;
            }

            if (body === '4') {
                session.step = 'vendedora';
                sessions.set(from, session);
                await msg.reply(`Deseja entrar em contato diretamente com uma de nossas vendedoras? Responda 'sim' para receber os contatos ou 'não' para aguardar o retorno por aqui.`);
                return;
            }

            await msg.reply("Por favor, escolha uma opção válida: 1, 2, 3 ou 4. Se quiser voltar ao início, digite 'menu'.");
            return;
        }

        if (session.step === 'vendedora') {
            if (body === 'sim') {
                session.step = 'contatos';
                sessions.set(from, session);
                await msg.reply(
                    `Contatos:\n` +
                    `1. Claudirene - (31) 99557-1471\n` +
                    `2. Fernanda (Móveis) - (31) 99913-2989\n` +
                    `3. Junia - (31) 99576-2208\n` +
                    `4. Keila - (31) 98707-6481\n` +
                    `5. Márcia Vieira - (31) 99501-0998\n` +
                    `6. Paloma - (31) 99493-7379\n` +
                    `7. Vanderlea (Móveis) - (31) 99752-6694\n` +
                    `8. Luenia - (31) 98266-7576\n` +
                    `9. Márcia Helena - (31) 99585-7612\n` +
                    `10. Lartione (Gerente) - +55 31 99647-4671`
                );
                session.step = 'final';
                sessions.set(from, session);
                return;
            }

            if (body === 'não' || body === 'nao') {
                await msg.reply('Entendido. Em breve uma de nossas vendedoras irá entrar em contato com você por aqui. Por favor, aguarde.');
                session.step = 'final';
                sessions.set(from, session);
                return;
            }

            await msg.reply("Por favor, responda 'sim' ou 'não'.");
            return;
        }

        if (session.step === 'crediario') {
            await msg.reply(`Obrigado. Vamos verificar e retornamos em breve.`);
            session.step = 'final';
            sessions.set(from, session);
            return;
        }

        if (session.step === 'orcamento') {
            await msg.reply(`Orçamento recebido. Em breve entraremos em contato.`);
            session.step = 'final';
            sessions.set(from, session);
            return;
        }

        if (session.step === 'produtos') {
            await msg.reply(`Solicitação sobre produto recebida. Em breve retornamos com detalhes.`);
            session.step = 'final';
            sessions.set(from, session);
            return;
        }

        if (session.step === 'final') {
            await msg.reply(`Se precisar de mais alguma coisa, é só digitar 'menu' para voltar ao início.`);
            return;
        }

    } catch (error) {
        console.error('Error handling message:', error);

        try {
            await msg.reply('Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.');
        } catch (replyError) {
            console.error('Error sending fallback message:', replyError);
        }
    }
});

client.initialize();