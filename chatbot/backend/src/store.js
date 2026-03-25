const clients = new Map();

let botEnabled = false;
let botConnected = false;

function getClients() {
    return Array.from(clients.values()).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function upsertClient(clientData) {
    const existing = clients.get(clientData.id);

    const updatedClient = {
        id: clientData.id,
        phone: clientData.phone ?? existing?.phone ?? "",
        name: clientData.name ?? existing?.name ?? "",
        summary: clientData.summary ?? existing?.summary ?? "",
        lastMessage: clientData.lastMessage ?? existing?.lastMessage ?? "",
        updatedAt: clientData.updatedAt ?? existing?.updatedAt ?? new Date().toISOString()
    };

    clients.set(clientData.id, updatedClient);
    return updatedClient;
}

function getBotStatus() {
    return { botEnabled, botConnected };
}

function setBotEnabled(value) {
    botEnabled = Boolean(value);
    return botEnabled;
}

function toggleBotEnabled() {
    botEnabled = !botEnabled;
    return botEnabled;
}

function setBotConnected(value) {
    botConnected = Boolean(value);
    return botConnected;
}

module.exports = {
    getClients,
    upsertClient,
    getBotStatus,
    setBotEnabled,
    setBotConnected,
    toggleBotEnabled
};