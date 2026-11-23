'use strict';

function parseHearthDeepLink(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'hearth:' && url.protocol !== 'nexo:') return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (url.hostname === 'dm' && /^\d+$/.test(parts[0] || '')) {
      if (parts.length === 1) return { type: 'dm', conversationId: Number(parts[0]) };
      if (parts[1] === 'message' && /^\d+$/.test(parts[2] || '')) {
        return { type: 'dm', conversationId: Number(parts[0]), messageId: Number(parts[2]) };
      }
    }
    if (url.hostname === 'channel' && /^\d+$/.test(parts[0] || '') && /^\d+$/.test(parts[1] || '')) {
      if (parts.length === 2) return { type: 'channel', serverId: Number(parts[0]), channelId: Number(parts[1]) };
      if (parts[2] === 'message' && /^\d+$/.test(parts[3] || '')) {
        return { type: 'channel', serverId: Number(parts[0]), channelId: Number(parts[1]), messageId: Number(parts[3]) };
      }
    }
    return null;
  } catch {
    return null;
  }
}

module.exports = { parseHearthDeepLink, parseNexoDeepLink: parseHearthDeepLink };
