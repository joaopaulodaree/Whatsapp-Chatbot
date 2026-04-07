# Whatsapp Chatbot - Souarte Nova Era

Chatbot para atendimento automatizado via WhatsApp, com painel web para gerenciamento de demandas e configurações.

## Funcionalidades

- **Atendimento automatico** via WhatsApp-web.js com menu interativo de opcoes
- **Consulta de crediario** via IA (Groq API) com base em dados CSV de clientes
- **Recebimento de comprovantes** de pagamento com captura de nome + imagem
- **Registro de demandas** em banco de dados SQLite com painel web
- **Painel web** para visualizar, filtrar e gerenciar demandas pendentes
- **Configuracoes** com controle do bot (ligar/desligar), QR code para autenticacao e upload de CSV
- **Editor de mensagens** do bot via interface web
- **Limpar cache** do WhatsApp para resolver problemas de sessao

## Estrutura

```
chatbot/
├── backend/
│   ├── src/
│   │   ├── bot/          # Modulo do bot e limpeza de cache
│   │   ├── db/           # Banco de dados SQLite e schemas
│   │   ├── services/     # Servicos do bot (demanda, contato)
│   │   ├── bot.js        # Logica principal do chatbot (whatsapp-web.js)
│   │   ├── bot_messages.json  # Mensagens editaveis do bot
│   │   ├── server.js     # API Express (rotas do bot, CSV, demandas)
│   │   ├── store.js      # Estado do bot (enabled, connected)
│   │   ├── messages.js   # Leitura/escrita de mensagens
│   │   ├── nameSearch.js # Busca de clientes por nome no CSV
│   │   └── cleanCsv.js   # Limpeza automatica de colunas do CSV
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx       # Aplicacao principal (Painel, Configuracoes, Mensagens)
│   │   ├── main.jsx      # Entry point React
│   │   └── styles.css     # Estilos globais
│   └── package.json
└── data/                 # Arquivos CSV enviados
```

## Tecnologias

| Camada     | Stack                                          |
| ---------- | ---------------------------------------------- |
| Chatbot    | whatsapp-web.js, Puppeteer, qrcode-terminal   |
| API        | Express, sqlite3, multer, groq-sdk, dotenv    |
| Frontend   | React, Vite, qrcode.react                     |
| Electron   | Empacotamento para aplicativo desktop         |

## Configuracao

### Variaveis de ambiente

Crie um arquivo `.env` na raiz do `backend/`:

```env
GROQ_API_KEY=sua-chave-aqui
GROQ_MODEL=openai/gpt-oss-120b
CSV_PATH=/caminho/para/seu/arquivo.csv
```

### Instalacao

```bash
# Backend
cd backend && npm install

# Frontend
cd frontend && npm install
```

### Execucao

```bash
# Backend (API + Bot)
cd backend && node src/server.js

# Frontend (em outro terminal)
cd frontend && npm run dev
```

O bot inicia automaticamente junto com o servidor. Se nao estiver autenticado, o QR code sera exibido no painel web em **Configuracoes**.

## Fluxo do Menu do Bot

1. **Checar crediario** - Cliente informa o nome, a IA consulta o CSV e responde a duvida
2. **Falar com vendedora** - Lista contatos ou registra demanda
3. **Pagar / Enviar comprovante** - Captura nome + imagem antes de registrar demanda
4. **Outros** - Registra demanda generica

O cliente pode digitar `menu` a qualquer momento para voltar ao inicio.

## Painel Web

| Rota        | Descricao                                      |
| ----------- | ---------------------------------------------- |
| `#`         | Painel de demandas (tabela com filtros)        |
| `#settings` | Configuracoes do bot, CSV e QR code           |
| `#messages` | Editor de mensagens do chatbot                 |

Acesse `http://127.0.0.1:5173` (Vite dev) ou o arquivo `index.html` direto.
