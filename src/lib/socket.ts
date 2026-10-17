import { io } from 'socket.io-client';

const SESSION_TOKEN_KEY = 'dejavu-session-token';

function createSessionToken(): string {
  if (typeof window.crypto?.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);

  if (typeof window.crypto?.getRandomValues === 'function') {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));

  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join('')
  ].join('-');
}

function getSessionToken(): string {
  const existingToken = window.sessionStorage.getItem(SESSION_TOKEN_KEY);

  if (existingToken) {
    return existingToken;
  }

  const newToken = createSessionToken();
  window.sessionStorage.setItem(SESSION_TOKEN_KEY, newToken);
  return newToken;
}

export const socket = io({
  autoConnect: false,
  auth: {
    sessionToken: getSessionToken()
  }
});

export function storeSessionToken(sessionToken: string): void {
  window.sessionStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
  socket.auth = {
    sessionToken
  };
}
