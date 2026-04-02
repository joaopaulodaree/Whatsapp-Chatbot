const { upsertClient } = require('../db/repositories/clients.repository');
const { createDemand } = require('../db/repositories/demands.repository');

async function getContactData(msg) {
  const contact = await msg.getContact();

  return {
    whatsappId: msg.from || null,
    phone: contact?.number || null,
    pushName: contact?.pushName || null,
  };
}

async function registerDemandFromMessage(msg, { type, description, name = null, status = 'pending' }) {
  const { whatsappId, phone, pushName } = await getContactData(msg);

  const clientRecord = upsertClient({
    name: name || pushName,
    phone,
    whatsappId,
  });

  const demand = createDemand({
    clientId: clientRecord.id,
    type,
    description,
    status,
  });

  return {
    client: clientRecord,
    demand,
  };
}

module.exports = {
  getContactData,
  registerDemandFromMessage,
};