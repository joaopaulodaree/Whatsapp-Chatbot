const { upsertClient } = require('../db/repositories/clients.repository');
const { createDemand, listDemands } = require('../db/repositories/demands.repository');

async function getContactData(msg) {
  const contact = await msg.getContact();

  return {
    whatsappId: msg.from || null,
    phone: contact?.number || null,
    pushName: contact?.name || contact?.pushName || null,
  };
}

async function registerDemand({ contact, type, description, status = 'pending' }) {
  const { whatsappId, phone, pushName } = contact;

  const clientRecord = upsertClient({
    name: pushName,
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
  registerDemand,
};