import { DEFAULT_ICE_SERVERS } from '@shared/constants';

// STUN works for most home networks. Strict NATs (corporate networks, many 4G
// carriers) also need a TURN relay; configure one at build time with:
//   VITE_TURN_URLS=turn:turn.example.com:3478,turns:turn.example.com:5349
//   VITE_TURN_USERNAME=...
//   VITE_TURN_CREDENTIAL=...
const env = import.meta.env || {};

export function getIceServers() {
  const servers = [...DEFAULT_ICE_SERVERS];
  if (env.VITE_TURN_URLS) {
    servers.push({
      urls: env.VITE_TURN_URLS.split(',').map((u) => u.trim()).filter(Boolean),
      username: env.VITE_TURN_USERNAME || '',
      credential: env.VITE_TURN_CREDENTIAL || ''
    });
  }
  return servers;
}

export const hasTurnServer = Boolean(env.VITE_TURN_URLS);
