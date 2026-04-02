let botEnabled = false;
let botConnected = false;

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
    getBotStatus,
    setBotEnabled,
    setBotConnected,
    toggleBotEnabled
};