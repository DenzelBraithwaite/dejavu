// Websocket
import { io } from 'socket.io-client';

// Thanos (Home PC IP)
// export const socket = io('http://192.168.2.10:6912');

// Work Macbook (Work IP - Wired)
export const socket = io('http://10.3.112.82:6912');

// Work Macbook (Work IP - WiFi)
// export const socket = io('http://10.3.144.82:6912');