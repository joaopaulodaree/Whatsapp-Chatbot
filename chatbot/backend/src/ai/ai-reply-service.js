'use strict';

const SYSTEM_PROMPT = `
Você é um assistente de consulta de dados financeiros de clientes.

Regras:
- Responda apenas o que foi perguntado.
- Não cumprimente.
- Não se apresente.
- Não finalize com frases de cortesia.
- Não invente informações.
- Use formato brasileiro para moeda (R$) e datas (DD/MM/AAAA).
- Seja o mais curto e objetivo possível.
- Os usuários podem escrever informalmente, com erros de digitação ou gírias.
`.trim();

function buildUserPrompt(client, userRequest) {
  const lines = client.duplicatas
    .map((d) => `- Duplicata ${d.duplic} | Vencimento ${d.vencto} | Total ${d.total}`)
    .join('\n');

  return `
Cliente: ${client.name} | Total da soma de todas as duplicatas: ${client.totalFormatted}

Duplicatas:
${lines}

Pedido do usuário:
${userRequest || 'Faça a melhor resposta para o cliente.'}

Importante:
- O total geral já foi calculado no sistema.
- Não recalcule os valores se a pergunta for sobre total.
- Use o total geral informado acima.
`.trim();
}

class AiReplyService {
  /**
   * @param {{ groqClient: import('groq-sdk'), model: string }} opts
   */
  constructor({ groqClient, model }) {
    this._groq = groqClient;
    this._model = model;
  }

  /**
   * @param {{ client: { name, totalFormatted, duplicatas }, userRequest: string }} opts
   * @returns {Promise<string>}
   * @throws {Error} with .debug attached when Groq returns an empty answer
   */
  async getReply({ client, userRequest }) {
    const userPrompt = buildUserPrompt(client, userRequest);

    const response = await this._groq.chat.completions.create({
      model: this._model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 1000,
      temperature: 0.2,
      reasoning_effort: 'medium',
    });

    const choice = response?.choices?.[0];
    const answer = String(choice?.message?.content || '').trim();

    console.log('--- GROQ DEBUG ---');
    console.log('finish_reason:', choice?.finish_reason);
    console.log('content length:', answer.length);
    console.log('usage:', response?.usage);
    console.log('model:', response?.model);
    console.log('------------------');

    if (!answer) {
      const err = new Error('Resposta vazia da IA');
      err.debug = {
        finish_reason: choice?.finish_reason,
        model: response?.model,
        usage: response?.usage,
        prompt_chars: userPrompt.length,
        system_prompt_chars: SYSTEM_PROMPT.length,
        prompt_preview: userPrompt.slice(0, 300),
        has_reasoning: !!choice?.message?.reasoning,
        reasoning_preview: choice?.message?.reasoning?.slice?.(0, 200),
      };
      throw err;
    }

    return answer;
  }
}

module.exports = { AiReplyService, buildUserPrompt, SYSTEM_PROMPT };
