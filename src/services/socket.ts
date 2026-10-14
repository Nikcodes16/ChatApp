
import {io} from 'socket.io-client';

const SERVER_URL = 'https://chatapp-6xj8.onrender.com';

const socket = io(SERVER_URL, {
  transports: ['websocket'],
  autoConnect: true,
});

socket.on('connect', () => {
  console.log('SOCKET CONNECTED:', socket.id);
});

socket.on('connect_error', error => {
  console.log('SOCKET ERROR:', error.message);
});

export default socket;