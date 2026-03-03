const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();

// 1. BULLETPROOF EXPRESS CORS: Allows your Vercel frontend to talk to this backend
app.use(cors({
    origin: "*", // The asterisk means "allow any frontend URL" so it won't block Vercel
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
}));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});


// --- 1. Database Connection ---
// Note: You must have MongoDB installed locally, or replace this with a MongoDB Atlas URI
mongoose.connect('mongodb+srv://admin:Jojo#76199>@cluster0.144rmay.mongodb.net/?appName=Cluster0')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// --- 2. Database Models ---
const User = mongoose.model('User', new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true } // In a real app, ALWAYS use bcrypt to hash this!
}));

const Message = mongoose.model('Message', new mongoose.Schema({
  sender: String,
  receiver: String,
  content: String,
  timestamp: { type: Date, default: Date.now }
}));

// --- 3. Authentication Routes ---
app.post('/register', async (req, res) => {
  try {
    const user = new User({ username: req.body.username, password: req.body.password });
    await user.save();
    res.json({ success: true, username: user.username });
  } catch (err) {
    res.status(400).json({ error: 'Username may already exist.' });
  }
});

app.post('/login', async (req, res) => {
  const user = await User.findOne({ username: req.body.username, password: req.body.password });
  if (user) res.json({ success: true, username: user.username });
  else res.status(401).json({ error: 'Invalid credentials' });
});

app.get('/messages/:user1/:user2', async (req, res) => {
  const { user1, user2 } = req.params;
  const messages = await Message.find({
    $or: [
      { sender: user1, receiver: user2 },
      { sender: user2, receiver: user1 }
    ]
  }).sort('timestamp');
  res.json(messages);
});

// --- 4. Socket.io Realtime Logic ---
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join a private room using the username
  socket.on('join_room', (username) => {
    socket.join(username);
    console.log(`${username} joined their room`);
  });

  // Handle private messages
  socket.on('private_message', async (data) => {
    const { sender, receiver, content } = data;

    // Save to database
    const newMessage = new Message({ sender, receiver, content });
    await newMessage.save();

    // Send to the receiver's room AND back to the sender's room
    io.to(receiver).emit('receive_message', newMessage);
    io.to(sender).emit('receive_message', newMessage);
  });

  socket.on('disconnect', () => console.log('User disconnected'));
});

// 4. THE RENDER PORT FIX: Render assigns a dynamic port, so we must use process.env.PORT
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running and listening on port ${PORT}`);
});