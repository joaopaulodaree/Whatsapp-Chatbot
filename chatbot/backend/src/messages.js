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

const REQUIRED_KEYS = [
  'greeting', 'menu_options', 'menu_label',
  'crediario_nome_request', 'crediario_duvida_request',
  'crediario_continue_question', 'crediario_new_duvida_request',
  'crediario_error', 'crediario_cliente_nao_encontrado',
  'invalid_option', 'yes_or_no', 'final_prompt',
  'pagamento_request', 'pagamento_imagem_confirm',
  'pagamento_nome_confirm', 'pagamento_final',
  'vendedora_question', 'vendedora_contacts', 'vendedora_wait',
  'outros_request', 'outros_confirm', 'generic_error',
];

function validateMessages(msgs) {
  const missing = REQUIRED_KEYS.filter((k) => !msgs[k]);
  if (missing.length > 0) {
    console.warn(`[messages] Chaves ausentes em bot_messages.json: ${missing.join(', ')}`);
  }
  return missing;
}

module.exports = { getMessages, saveMessages, getMessagesPath, validateMessages };
