const express = require('express');
const cors = require('cors');
const {
    getClients,
    upsertClient,
    getBotStatus,
    toggleBotStatus,
} = require('./store');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
    res.json({ ok: true, message: 'Backend funcionando' });
});

app.get('/api/clients', (req, res) => {
    const clients = getClients();
    res.json(clients);
});

app.get('/api/bot-status', (req, res) => {
    res.json(getBotStatus());
});

app.post('/api/toggle-bot', (req, res) => {
    const enabled = toggleBotEnabled();
    res.json({ enabled, connected: getBotStatus().botConnected, message: enabled ? 'Bot ativado' : 'Bot desativado' });
});

app.post('/api/test-client', (req, res) => {
    const client = upsertClient({
        id: 'test-client',
        phone: '123456789',
        name: 'Cliente Teste',
        summary: 'Checar crediário - João Paulo Souza',
        lastMessage: 'Mensagem de teste',
    });
    res.status(201).json(client);
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});