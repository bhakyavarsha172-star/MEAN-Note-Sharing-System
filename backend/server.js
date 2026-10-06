require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const connectDB = require('./config/db');
const { initRealtime } = require('./config/realtime');
const authRoutes = require('./routes/authRoutes');
const noteRoutes = require('./routes/noteRoutes');

const app = express();
const server = http.createServer(app);

connectDB();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/notes', noteRoutes);

app.get('/', (req, res) => {
  res.send('Note Sharing API is running');
});

// Socket.IO shares the same HTTP server/port as the REST API
const io = new Server(server, {
  cors: { origin: '*' }
});
initRealtime(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server (HTTP + WebSocket) running on port ${PORT}`));
