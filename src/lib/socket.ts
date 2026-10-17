import { io } from 'socket.io-client';

const SESSION_TOKEN_KEY = 'dejavu-session-token';

function getSessionToken(): string {
  const existingToken = window.localStorage.getItem(SESSION_TOKEN_KEY);

  if (existingToken) {
    return existingToken;
  }

  const newToken = window.crypto.randomUUID();
  window.localStorage.setItem(SESSION_TOKEN_KEY, newToken);
  return newToken;
}

export const socket = io({
  autoConnect: false,
  auth: {
    sessionToken: getSessionToken()
  }
});

export function storeSessionToken(sessionToken: string): void {
  window.localStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
  socket.auth = {
    sessionToken
  };
}
