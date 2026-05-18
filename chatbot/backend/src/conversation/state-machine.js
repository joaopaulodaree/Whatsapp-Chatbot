'use strict';

class ConversationStateMachine {
  /**
   * @param {{
   *   aiService: { getReply(name: string, question: string): Promise<string> },
   *   demandService: { registerDemand(opts: { contact, type, description }): Promise<void> },
   *   sessionStore: { has, get, set, delete },
   *   messageStore: { get(): object }
   * }} deps
   */
  constructor({ aiService, demandService, sessionStore, messageStore }) {
    this._ai = aiService;
    this._demands = demandService;
    this._sessions = sessionStore;
    this._messages = messageStore;
  }

  /**
   * @param {{ from: string, body: string, hasMedia: boolean, contact: { whatsappId, phone, pushName } }} message
   * @returns {Promise<string[]>}
   */
  async handle({ from, body, hasMedia, contact }) {
    const msgs = this._messages.get();
    const rawBody = (body || '').trim();
    const normalizedBody = rawBody.toLowerCase();

    if (normalizedBody === 'menu' && !hasMedia) {
      this._set(from, 'menu', {});
      return [msgs.menu_label + '\n' + msgs.menu_options];
    }

    if (!this._sessions.has(from)) {
      this._set(from, 'menu', {});
      return [msgs.greeting + '\n' + msgs.menu_options];
    }

    const session = this._sessions.get(from);

    switch (session.step) {
      case 'menu':
        return this._menu(from, normalizedBody, msgs);
      case 'crediario_nome':
        return this._crediarioNome(from, rawBody, msgs);
      case 'crediario_duvida':
      case 'crediario_new_duvida':
        return this._crediarioDuvida(session, from, rawBody, msgs);
      case 'crediario_continue':
        return this._crediarioContinue(session, from, normalizedBody, msgs);
      case 'pagamento':
      case 'pagamento_nome':
      case 'pagamento_imagem':
        return this._pagamento(session, from, rawBody, hasMedia, contact, msgs);
      case 'vendedora':
        return this._vendedora(from, normalizedBody, contact, msgs);
      case 'outros':
        return this._outros(from, rawBody, contact, msgs);
      case 'final':
        return this._finalReset(from, msgs);
      default:
        return this._finalReset(from, msgs);
    }
  }

  _menu(from, normalizedBody, msgs) {
    const map = {
      '1': ['crediario_nome', msgs.crediario_nome_request],
      '2': ['vendedora', msgs.vendedora_question],
      '3': ['pagamento', msgs.pagamento_request],
      '4': ['outros', msgs.outros_request],
    };
    const t = map[normalizedBody];
    if (!t) return [msgs.invalid_option];
    this._set(from, t[0], {});
    return [t[1]];
  }

  _crediarioNome(from, rawBody, msgs) {
    this._set(from, 'crediario_duvida', { name: rawBody });
    return [msgs.crediario_duvida_request];
  }

  async _crediarioDuvida(session, from, rawBody, msgs) {
    try {
      const answer = await this._ai.getReply(session.data.name, rawBody);
      this._set(from, 'crediario_continue', session.data);
      return [answer, msgs.crediario_continue_question];
    } catch (error) {
      if (error.message === 'Cliente não encontrado') {
        const notFound = msgs.crediario_cliente_nao_encontrado
          ? msgs.crediario_cliente_nao_encontrado.replace('{name}', session.data.name)
          : `Não encontrei nenhum registro para o nome "${session.data.name}". Verifique se digitou corretamente.`;
        this._set(from, 'crediario_nome', {});
        return [notFound];
      }
      this._set(from, 'crediario_continue', session.data);
      return [msgs.crediario_error, msgs.crediario_continue_question];
    }
  }

  _crediarioContinue(session, from, normalizedBody, msgs) {
    if (normalizedBody === 'sim') {
      this._set(from, 'crediario_new_duvida', session.data);
      return [msgs.crediario_new_duvida_request];
    }
    if (normalizedBody === 'não' || normalizedBody === 'nao') {
      this._set(from, 'final', {});
      return [msgs.final_prompt];
    }
    return [msgs.yes_or_no];
  }

  async _pagamento(session, from, rawBody, hasMedia, contact, msgs) {
    if (session.step === 'pagamento') {
      if (hasMedia) {
        this._set(from, 'pagamento_nome', { hasImage: true });
        return [msgs.pagamento_imagem_confirm];
      }
      if (rawBody) {
        this._set(from, 'pagamento_imagem', { name: rawBody });
        return [msgs.pagamento_nome_confirm];
      }
      return ['Por favor, envie o comprovante (imagem) ou o nome do crediário (texto).'];
    }

    if (session.step === 'pagamento_nome') {
      if (rawBody && !hasMedia) {
        await this._demands.registerDemand({
          contact,
          type: 'crediario',
          description: `Cliente: ${rawBody} - comprovante recebido`,
        });
        this._set(from, 'final', {});
        return [msgs.pagamento_final];
      }
      return ['Por favor, envie o nome do crediário (texto).'];
    }

    if (session.step === 'pagamento_imagem') {
      if (hasMedia) {
        await this._demands.registerDemand({
          contact,
          type: 'crediario',
          description: `Cliente: ${session.data.name} - comprovante recebido`,
        });
        this._set(from, 'final', {});
        return [msgs.pagamento_final];
      }
      return ['Por favor, envie o comprovante de pagamento (imagem).'];
    }

    return [];
  }

  async _vendedora(from, normalizedBody, contact, msgs) {
    if (normalizedBody === 'sim') {
      this._set(from, 'final', {});
      return [msgs.vendedora_contacts];
    }
    if (normalizedBody === 'não' || normalizedBody === 'nao') {
      await this._demands.registerDemand({
        contact,
        type: 'vendedora',
        description: 'Cliente deseja falar com uma vendedora',
      });
      this._set(from, 'final', {});
      return [msgs.vendedora_wait];
    }
    return [msgs.yes_or_no];
  }

  async _outros(from, rawBody, contact, msgs) {
    await this._demands.registerDemand({
      contact: { ...contact, pushName: contact.pushName || 'Cliente' },
      type: 'outros',
      description: rawBody,
    });
    this._set(from, 'final', {});
    return [msgs.outros_confirm];
  }

  _finalReset(from, msgs) {
    this._set(from, 'menu', {});
    return [msgs.menu_label + '\n' + msgs.menu_options];
  }

  _set(from, step, data) {
    this._sessions.set(from, { step, data });
  }
}

module.exports = { ConversationStateMachine };
