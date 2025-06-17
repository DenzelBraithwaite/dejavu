// Websocket
import { io } from 'socket.io-client';

// Thanos
export const socket = io('http://192.168.2.10:6912');