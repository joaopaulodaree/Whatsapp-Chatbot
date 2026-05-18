'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { ConversationStateMachine } = require('./state-machine');

// --- Fakes ---

class FakeSessionStore {
  constructor() { this._map = new Map(); }
  has(from) { return this._map.has(from); }
  get(from) { return this._map.get(from) || null; }
  set(from, session) { this._map.set(from, session); }
  delete(from) { this._map.delete(from); }
}

const msgs = {
  greeting: 'Olá!',
  menu_options: '1 - Crediário',
  menu_label: 'Menu:',
  crediario_nome_request: 'Informe seu nome.',
  crediario_duvida_request: 'Qual sua dúvida?',
  crediario_continue_question: 'Mais dúvidas? sim/não',
  crediario_new_duvida_request: 'Qual a nova dúvida?',
  crediario_error: 'Erro ao consultar.',
  crediario_cliente_nao_encontrado: 'Não encontrei "{name}". Tente novamente.',
  invalid_option: 'Opção inválida.',
  yes_or_no: 'Responda sim ou não.',
  final_prompt: 'Obrigado!',
  pagamento_request: 'Envie comprovante ou nome.',
  pagamento_imagem_confirm: 'Imagem recebida! Qual o nome?',
  pagamento_nome_confirm: 'Nome recebido! Envie a imagem.',
  pagamento_final: 'Pagamento registrado!',
  vendedora_question: 'Quer os contatos? sim/não',
  vendedora_contacts: 'Contatos: ...',
  vendedora_wait: 'Aguarde.',
  outros_request: 'Descreva o que precisa.',
  outros_confirm: 'Solicitação registrada!',
  generic_error: 'Erro genérico.',
};

const contact = { whatsappId: 'user1@c.us', phone: '5511', pushName: 'Teste' };

function makeMachine({ aiService, demandService } = {}) {
  return new ConversationStateMachine({
    aiService: aiService || { getReply: async () => 'resposta AI' },
    demandService: demandService || { registerDemand: async () => {} },
    sessionStore: new FakeSessionStore(),
    messageStore: { get: () => msgs },
  });
}

function msg(body, { from = 'user1', hasMedia = false } = {}) {
  return { from, body, hasMedia, contact };
}

// --- Tests ---

describe('ConversationStateMachine', () => {

  describe('new session', () => {
    it('greets and shows menu on first message', async () => {
      const m = makeMachine();
      const replies = await m.handle(msg('oi'));
      assert.deepEqual(replies, [msgs.greeting + '\n' + msgs.menu_options]);
    });

    it('"menu" keyword resets to menu from any state', async () => {
      const m = makeMachine();
      await m.handle(msg('oi'));          // create session
      await m.handle(msg('1'));           // go to crediario_nome
      const replies = await m.handle(msg('menu'));
      assert.deepEqual(replies, [msgs.menu_label + '\n' + msgs.menu_options]);
    });
  });

  describe('menu', () => {
    it('option 1 → crediario_nome', async () => {
      const m = makeMachine();
      await m.handle(msg('oi'));
      const replies = await m.handle(msg('1'));
      assert.deepEqual(replies, [msgs.crediario_nome_request]);
    });

    it('option 2 → vendedora', async () => {
      const m = makeMachine();
      await m.handle(msg('oi'));
      const replies = await m.handle(msg('2'));
      assert.deepEqual(replies, [msgs.vendedora_question]);
    });

    it('option 3 → pagamento', async () => {
      const m = makeMachine();
      await m.handle(msg('oi'));
      const replies = await m.handle(msg('3'));
      assert.deepEqual(replies, [msgs.pagamento_request]);
    });

    it('option 4 → outros', async () => {
      const m = makeMachine();
      await m.handle(msg('oi'));
      const replies = await m.handle(msg('4'));
      assert.deepEqual(replies, [msgs.outros_request]);
    });

    it('invalid option → error message', async () => {
      const m = makeMachine();
      await m.handle(msg('oi'));
      const replies = await m.handle(msg('9'));
      assert.deepEqual(replies, [msgs.invalid_option]);
    });
  });

  describe('crediário flow', () => {
    it('name → asks question', async () => {
      const m = makeMachine();
      await m.handle(msg('oi'));
      await m.handle(msg('1'));
      const replies = await m.handle(msg('João Silva'));
      assert.deepEqual(replies, [msgs.crediario_duvida_request]);
    });

    it('question → AI reply + continue question', async () => {
      const ai = { getReply: async (name, q) => `Info sobre ${name}: ${q}` };
      const m = makeMachine({ aiService: ai });
      await m.handle(msg('oi'));
      await m.handle(msg('1'));
      await m.handle(msg('João Silva'));
      const replies = await m.handle(msg('Qual meu saldo?'));
      assert.equal(replies[0], 'Info sobre João Silva: Qual meu saldo?');
      assert.equal(replies[1], msgs.crediario_continue_question);
    });

    it('"Cliente não encontrado" → back to crediario_nome with name in message', async () => {
      const ai = { getReply: async () => { throw new Error('Cliente não encontrado'); } };
      const m = makeMachine({ aiService: ai });
      await m.handle(msg('oi'));
      await m.handle(msg('1'));
      await m.handle(msg('Nome Errado'));
      const replies = await m.handle(msg('qualquer dúvida'));
      assert.ok(replies[0].includes('Nome Errado'));
      // next message should ask for name again
      const nextReplies = await m.handle(msg('Nome Certo'));
      assert.deepEqual(nextReplies, [msgs.crediario_duvida_request]);
    });

    it('other AI error → error message + continue question', async () => {
      const ai = { getReply: async () => { throw new Error('timeout'); } };
      const m = makeMachine({ aiService: ai });
      await m.handle(msg('oi'));
      await m.handle(msg('1'));
      await m.handle(msg('João'));
      const replies = await m.handle(msg('dúvida'));
      assert.deepEqual(replies, [msgs.crediario_error, msgs.crediario_continue_question]);
    });

    it('"sim" at continue → asks new question', async () => {
      const m = makeMachine();
      await m.handle(msg('oi'));
      await m.handle(msg('1'));
      await m.handle(msg('João'));
      await m.handle(msg('dúvida'));       // goes to crediario_continue
      const replies = await m.handle(msg('sim'));
      assert.deepEqual(replies, [msgs.crediario_new_duvida_request]);
    });

    it('"não" at continue → final', async () => {
      const m = makeMachine();
      await m.handle(msg('oi'));
      await m.handle(msg('1'));
      await m.handle(msg('João'));
      await m.handle(msg('dúvida'));
      const replies = await m.handle(msg('não'));
      assert.deepEqual(replies, [msgs.final_prompt]);
    });

    it('invalid answer at continue → yes_or_no', async () => {
      const m = makeMachine();
      await m.handle(msg('oi'));
      await m.handle(msg('1'));
      await m.handle(msg('João'));
      await m.handle(msg('dúvida'));
      const replies = await m.handle(msg('talvez'));
      assert.deepEqual(replies, [msgs.yes_or_no]);
    });
  });

  describe('pagamento flow', () => {
    it('media first → asks name', async () => {
      const m = makeMachine();
      await m.handle(msg('oi'));
      await m.handle(msg('3'));
      const replies = await m.handle(msg('', { hasMedia: true }));
      assert.deepEqual(replies, [msgs.pagamento_imagem_confirm]);
    });

    it('name first → asks image', async () => {
      const m = makeMachine();
      await m.handle(msg('oi'));
      await m.handle(msg('3'));
      const replies = await m.handle(msg('João Silva'));
      assert.deepEqual(replies, [msgs.pagamento_nome_confirm]);
    });

    it('media first then name → registers demand and goes to final', async () => {
      const registered = [];
      const demands = { registerDemand: async (opts) => registered.push(opts) };
      const m = makeMachine({ demandService: demands });
      await m.handle(msg('oi'));
      await m.handle(msg('3'));
      await m.handle(msg('', { hasMedia: true }));   // pagamento_nome
      const replies = await m.handle(msg('João Silva'));
      assert.deepEqual(replies, [msgs.pagamento_final]);
      assert.equal(registered.length, 1);
      assert.ok(registered[0].description.includes('João Silva'));
    });

    it('name first then media → registers demand and goes to final', async () => {
      const registered = [];
      const demands = { registerDemand: async (opts) => registered.push(opts) };
      const m = makeMachine({ demandService: demands });
      await m.handle(msg('oi'));
      await m.handle(msg('3'));
      await m.handle(msg('Maria'));                        // pagamento_imagem
      const replies = await m.handle(msg('', { hasMedia: true }));
      assert.deepEqual(replies, [msgs.pagamento_final]);
      assert.equal(registered.length, 1);
      assert.ok(registered[0].description.includes('Maria'));
    });
  });

  describe('vendedora flow', () => {
    it('"sim" → sends contacts and goes to final', async () => {
      const m = makeMachine();
      await m.handle(msg('oi'));
      await m.handle(msg('2'));
      const replies = await m.handle(msg('sim'));
      assert.deepEqual(replies, [msgs.vendedora_contacts]);
    });

    it('"não" → registers demand and goes to final', async () => {
      const registered = [];
      const demands = { registerDemand: async (opts) => registered.push(opts) };
      const m = makeMachine({ demandService: demands });
      await m.handle(msg('oi'));
      await m.handle(msg('2'));
      const replies = await m.handle(msg('não'));
      assert.deepEqual(replies, [msgs.vendedora_wait]);
      assert.equal(registered.length, 1);
      assert.equal(registered[0].type, 'vendedora');
    });

    it('invalid answer → yes_or_no', async () => {
      const m = makeMachine();
      await m.handle(msg('oi'));
      await m.handle(msg('2'));
      const replies = await m.handle(msg('talvez'));
      assert.deepEqual(replies, [msgs.yes_or_no]);
    });
  });

  describe('outros flow', () => {
    it('description → registers demand and goes to final', async () => {
      const registered = [];
      const demands = { registerDemand: async (opts) => registered.push(opts) };
      const m = makeMachine({ demandService: demands });
      await m.handle(msg('oi'));
      await m.handle(msg('4'));
      const replies = await m.handle(msg('Preciso de ajuda com entrega'));
      assert.deepEqual(replies, [msgs.outros_confirm]);
      assert.equal(registered.length, 1);
      assert.equal(registered[0].type, 'outros');
      assert.equal(registered[0].description, 'Preciso de ajuda com entrega');
    });
  });

  describe('final state', () => {
    it('auto-resets to menu on next message', async () => {
      const m = makeMachine();
      await m.handle(msg('oi'));
      await m.handle(msg('2'));
      await m.handle(msg('sim'));           // → final
      const replies = await m.handle(msg('oi'));
      assert.deepEqual(replies, [msgs.menu_label + '\n' + msgs.menu_options]);
    });
  });

  describe('session isolation', () => {
    it('two users have independent sessions', async () => {
      const m = makeMachine();
      await m.handle(msg('oi', { from: 'userA' }));
      await m.handle(msg('oi', { from: 'userB' }));
      await m.handle(msg('1', { from: 'userA' }));  // A → crediario_nome
      // B is still on menu
      const repliesB = await m.handle(msg('2', { from: 'userB' }));
      assert.deepEqual(repliesB, [msgs.vendedora_question]);
    });
  });
});
