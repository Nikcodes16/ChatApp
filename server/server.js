const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { Readable } = require('stream');

const Message = require('./models/Message');
const User = require('./models/User');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

app.use(cors());
app.use(express.json());

// =========================
// CLOUDINARY CONFIGURATION
// =========================

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Profile-photo upload: maximum 5 MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(
        new Error('Only JPG, PNG, and WebP images are allowed.')
      );
    }

    cb(null, true);
  },
});

// Handle upload validation errors
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      message:
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Image must be 5 MB or smaller.'
          : 'Invalid upload.',
    });
  }

  if (
    err &&
    err.message ===
      'Only JPG, PNG, and WebP images are allowed.'
  ) {
    return res.status(400).json({
      message: err.message,
    });
  }

  next(err);
});

// =========================
// HEALTH CHECK
// =========================

app.get('/', (req, res) => {
  res.json({
    message: 'ChatApp backend is running!',
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    database:
      mongoose.connection.readyState === 1
        ? 'connected'
        : 'disconnected',
  });
});

// =========================
// GET CHAT HISTORY
// =========================

app.get('/messages', async (req, res) => {
  try {
    const roomId = String(req.query.roomId || '').trim();
    const userId = String(req.query.userId || '').trim();

    if (!roomId || !userId) {
      return res.status(400).json({
        message: 'roomId and userId are required',
      });
    }

    const messages = await Message.find({
      roomId,
      deletedFor: { $ne: userId },
    })
      .sort({ createdAt: 1 })
      .lean();

    return res.json(messages);
  } catch (error) {
    console.error('GET /messages error:', error);

    return res.status(500).json({
      message: 'Failed to fetch messages',
    });
  }
});

// =========================
// UNREAD COUNTS
// =========================

app.get('/unread-counts', async (req, res) => {
  try {
    const userId = String(req.query.userId || '').trim();

    if (!userId) {
      return res.status(400).json({
        message: 'userId is required',
      });
    }

    const results = await Message.aggregate([
      {
        $match: {
          receiver: userId,
          status: { $ne: 'seen' },
          isDeleted: { $ne: true },
        },
      },
      {
        $group: {
          _id: '$sender',
          count: { $sum: 1 },
        },
      },
    ]);

    const unreadCounts = {};

    results.forEach(item => {
      if (item._id != null) {
        unreadCounts[String(item._id)] = item.count;
      }
    });

    return res.json(unreadCounts);
  } catch (error) {
    console.error('Unread counts fetch failed:', error);

    return res.status(500).json({
      message: 'Failed to fetch unread counts',
    });
  }
});

// =========================
// GET USERS
// =========================

app.get('/users', async (req, res) => {
  try {
    const excludeId = req.query.exclude;
    const filter = {};

    if (
      typeof excludeId === 'string' &&
      mongoose.Types.ObjectId.isValid(excludeId)
    ) {
      filter._id = {
        $ne: new mongoose.Types.ObjectId(excludeId),
      };
    }

    const users = await User.find(filter)
      .select('_id name email about profilePhoto')
      .sort({ name: 1 })
      .lean();

    return res.json(
      users.map(user => ({
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        about: user.about || '',
        profilePhoto: user.profilePhoto || '',
      }))
    );
  } catch (error) {
    console.error('Users fetch failed:', error);

    return res.status(500).json({
      message: 'Failed to fetch users',
    });
  }
});

// =========================
// PUBLIC PROFILE HELPER
// =========================

const getPublicProfile = user => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  about: user.about || '',
  profilePhoto: user.profilePhoto || '',
});

// =========================
// GET PROFILE
// =========================

app.get('/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        message: 'Invalid user ID',
      });
    }

    const user = await User.findById(userId)
      .select('_id name email about profilePhoto')
      .lean();

    if (!user) {
      return res.status(404).json({
        message: 'User not found',
      });
    }

    return res.json(getPublicProfile(user));
  } catch (error) {
    console.error('GET PROFILE ERROR:', error);

    return res.status(500).json({
      message: 'Failed to load profile',
    });
  }
});

// =========================
// UPDATE PROFILE
// =========================

app.put('/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, about, profilePhoto } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        message: 'Invalid user ID',
      });
    }

    const updates = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({
          message: 'Name is required',
        });
      }

      updates.name = name.trim();
    }

    if (about !== undefined) {
      if (typeof about !== 'string' || about.length > 150) {
        return res.status(400).json({
          message: 'About must be 150 characters or fewer',
        });
      }

      updates.about = about.trim();
    }

    if (profilePhoto !== undefined) {
      if (
        typeof profilePhoto !== 'string' ||
        profilePhoto.length > 2048
      ) {
        return res.status(400).json({
          message: 'Invalid profile photo URL',
        });
      }

      updates.profilePhoto = profilePhoto.trim();
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        message: 'No profile fields provided',
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('_id name email about profilePhoto');

    if (!user) {
      return res.status(404).json({
        message: 'User not found',
      });
    }

    return res.json({
      message: 'Profile updated successfully',
      user: getPublicProfile(user),
    });
  } catch (error) {
    console.error('UPDATE PROFILE ERROR:', error);

    return res.status(500).json({
      message: 'Failed to update profile',
    });
  }
});

// =========================
// UPLOAD PROFILE PHOTO
// =========================

app.post(
  '/upload/profile-photo/:userId',
  upload.single('photo'),
  async (req, res) => {
    try {
      const { userId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({
          message: 'Invalid user ID',
        });
      }

      if (!req.file) {
        return res.status(400).json({
          message: 'Please select a profile photo',
        });
      }

      if (
        !process.env.CLOUDINARY_CLOUD_NAME ||
        !process.env.CLOUDINARY_API_KEY ||
        !process.env.CLOUDINARY_API_SECRET
      ) {
        return res.status(500).json({
          message: 'Cloudinary is not configured',
        });
      }

      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          message: 'User not found',
        });
      }

      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'chatapp/profile-photos',
            public_id: `user_${userId}`,
            overwrite: true,
            resource_type: 'image',
            allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
          },
          (error, uploadResult) => {
            if (error) {
              return reject(error);
            }

            if (!uploadResult) {
              return reject(
                new Error('Cloudinary upload returned no result')
              );
            }

            resolve(uploadResult);
          }
        );

        Readable.from(req.file.buffer).pipe(stream);
      });

      user.profilePhoto = result.secure_url;
      await user.save();

      return res.json({
        message: 'Profile photo updated successfully',
        user: getPublicProfile(user),
      });
    } catch (error) {
      console.error('PROFILE PHOTO UPLOAD ERROR:', error);

      return res.status(500).json({
        message: 'Failed to upload profile photo',
      });
    }
  }
);

// =========================
// REGISTER WITH BCRYPT
// =========================

app.post('/register', async (req, res) => {
  try {
    const name =
      typeof req.body.name === 'string'
        ? req.body.name.trim()
        : '';

    const email =
      typeof req.body.email === 'string'
        ? req.body.email.trim().toLowerCase()
        : '';

    const password =
      typeof req.body.password === 'string'
        ? req.body.password
        : '';

    if (!name || !email || !password) {
      return res.status(400).json({
        message: 'All fields are required',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: 'Password must be at least 8 characters long',
      });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        message: 'User already exists',
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
    });

    return res.status(201).json({
      message: 'Registration successful',
      userId: user._id.toString(),
      name: user.name,
      email: user.email,
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(400).json({
        message: 'User already exists',
      });
    }

    console.error('Registration failed:', error);

    return res.status(500).json({
      message: 'Registration failed',
    });
  }
});

// =========================
// LOGIN WITH BCRYPT
// Supports migration of legacy plain-text passwords
// =========================

app.post('/login', async (req, res) => {
  try {
    const email =
      typeof req.body.email === 'string'
        ? req.body.email.trim().toLowerCase()
        : '';

    const password =
      typeof req.body.password === 'string'
        ? req.body.password
        : '';

    if (!email || !password) {
      return res.status(400).json({
        message: 'Email and password are required',
      });
    }

    const user = await User.findOne({ email });

    if (!user || typeof user.password !== 'string') {
      return res.status(401).json({
        message: 'Invalid email or password',
      });
    }

    const looksLikeBcryptHash =
      /^\$2[aby]\$\d{2}\$/.test(user.password);

    let passwordIsValid = false;

    if (looksLikeBcryptHash) {
      passwordIsValid = await bcrypt.compare(
        password,
        user.password
      );
    } else if (user.password === password) {
      passwordIsValid = true;
      user.password = await bcrypt.hash(password, 12);
      await user.save();
    }

    if (!passwordIsValid) {
      return res.status(401).json({
        message: 'Invalid email or password',
      });
    }

    return res.json({
      message: 'Login successful',
      userId: user._id.toString(),
      name: user.name,
      email: user.email,
    });
  } catch (error) {
    console.error('Login failed:', error);

    return res.status(500).json({
      message: 'Login failed',
    });
  }
});

// =========================
// ONLINE USERS
// =========================

const onlineUsers = new Map();

// =========================
// UPDATE UNREAD COUNTS
// =========================

async function updateUnreadCount(receiverId, senderId) {
  try {
    if (!receiverId || !senderId) {
      return;
    }

    const receiver = String(receiverId);
    const sender = String(senderId);

    const count = await Message.countDocuments({
      receiver,
      sender,
      status: { $ne: 'seen' },
      isDeleted: { $ne: true },
    });

    const receiverSocketId = onlineUsers.get(receiver);

    if (receiverSocketId) {
      io.to(receiverSocketId).emit('unread_count_update', {
        senderId: sender,
        count,
      });
    }
  } catch (error) {
    console.error('Unread count update failed:', error);
  }
}

// =========================
// SOCKET CONNECTION
// =========================

io.on('connection', socket => {
  console.log('User connected:', socket.id);

  // USER ONLINE
  socket.on('user_online', userId => {
    if (!userId) {
      return;
    }

    const id = String(userId);

    onlineUsers.set(id, socket.id);

    console.log('USER ONLINE:', id);
    io.emit('online_users', Array.from(onlineUsers.keys()));

    socket.broadcast.emit('user_status', {
      userId: id,
      online: true,
    });
  });

  // JOIN CHAT ROOM
  socket.on('join_room', roomId => {
    if (!roomId) {
      return;
    }

    socket.join(String(roomId));
    console.log('JOINED ROOM:', String(roomId));
  });

  // TYPING INDICATOR
  socket.on('typing', data => {
    if (!data?.roomId || !data?.userId) {
      return;
    }

    const roomId = String(data.roomId);

    socket.to(roomId).emit('user_typing', {
      roomId,
      userId: String(data.userId),
      isTyping: Boolean(data.isTyping),
    });
  });

  // SEND MESSAGE
  socket.on('send_message', async message => {
    try {
      console.log('MESSAGE RECEIVED:', message);

      if (
        !message?.text?.trim() ||
        !message?.sender ||
        !message?.receiver ||
        !message?.roomId
      ) {
        console.log('INVALID MESSAGE DATA');
        return;
      }

      const senderId = String(message.sender);
      const receiverId = String(message.receiver);
      const roomId = String(message.roomId);

      let replyTo = null;

      if (message.replyTo?.messageId) {
        const originalMessage = await Message.findOne({
          _id: message.replyTo.messageId,
          roomId,
        }).lean();

        if (originalMessage) {
          replyTo = {
            messageId: originalMessage._id.toString(),
            text: originalMessage.isDeleted
              ? 'This message was deleted'
              : originalMessage.text,
            sender: String(originalMessage.sender),
          };
        }
      }

      const savedMessage = await Message.create({
        text: message.text.trim(),
        sender: senderId,
        receiver: receiverId,
        roomId,
        status: 'sent',
        replyTo,
        isDeleted: false,
      });

      const messageData = {
        id: savedMessage._id.toString(),
        _id: savedMessage._id.toString(),
        text: savedMessage.text,
        sender: senderId,
        receiver: receiverId,
        roomId,
        status: savedMessage.status,
        replyTo: savedMessage.replyTo || null,
        isDeleted: false,
      };

      console.log('MESSAGE SAVED:', messageData.id);

      socket.emit('message_sent', messageData);
      socket.to(roomId).emit('receive_message', messageData);

      await updateUnreadCount(receiverId, senderId);
    } catch (error) {
      console.error('Message save failed:', error);
    }
  });

  // DELETE MESSAGE FOR EVERYONE
  socket.on('delete_message', async data => {
    try {
      const messageId = String(data?.messageId || '').trim();
      const userId = String(data?.userId || '').trim();
      const requestedRoomId = String(data?.roomId || '').trim();

      if (
        !mongoose.Types.ObjectId.isValid(messageId) ||
        !userId
      ) {
        socket.emit('delete_message_error', {
          message: 'Invalid message ID or user ID',
        });
        return;
      }

      const message = await Message.findOne({
        _id: messageId,
        sender: userId,
        isDeleted: { $ne: true },
      });

      if (!message) {
        socket.emit('delete_message_error', {
          message: 'Message not found or you cannot delete it',
        });
        return;
      }

      if (
        requestedRoomId &&
        String(message.roomId) !== requestedRoomId
      ) {
        socket.emit('delete_message_error', {
          message: 'Message does not belong to this chat',
        });
        return;
      }

      message.text = 'This message was deleted';
      message.isDeleted = true;
      message.deletedBy = userId;

      await message.save();

      const payload = {
        messageId: message._id.toString(),
        roomId: String(message.roomId),
        text: 'This message was deleted',
        isDeleted: true,
      };

      io.to(String(message.roomId)).emit(
        'message_deleted',
        payload
      );

      await updateUnreadCount(
        String(message.receiver),
        String(message.sender)
      );
    } catch (error) {
      console.error('DELETE MESSAGE ERROR:', error);

      socket.emit('delete_message_error', {
        message: 'Failed to delete message',
      });
    }
  });

  // DELETE MESSAGE FOR ME
  socket.on('delete_message_for_me', async data => {
    try {
      const messageId = String(data?.messageId || '').trim();
      const userId = String(data?.userId || '').trim();
      const roomId = String(data?.roomId || '').trim();

      if (
        !mongoose.Types.ObjectId.isValid(messageId) ||
        !userId ||
        !roomId
      ) {
        socket.emit('delete_message_error', {
          message: 'Invalid message, user, or room ID',
        });
        return;
      }

      const message = await Message.findOne({
        _id: messageId,
        roomId,
        $or: [{ sender: userId }, { receiver: userId }],
      });

      if (!message) {
        socket.emit('delete_message_error', {
          message: 'Message not found in this chat',
        });
        return;
      }

      if (!message.deletedFor.includes(userId)) {
        message.deletedFor.push(userId);
        await message.save();
      }

      socket.emit('message_deleted_for_me', {
        messageId: message._id.toString(),
        roomId: String(message.roomId),
        userId,
      });
    } catch (error) {
      console.error('DELETE FOR ME ERROR:', error);

      socket.emit('delete_message_error', {
        message: 'Failed to delete message for you',
      });
    }
  });

  // MESSAGE DELIVERED
  socket.on('message_delivered', async messageId => {
    try {
      if (
        !messageId ||
        !mongoose.Types.ObjectId.isValid(String(messageId))
      ) {
        return;
      }

      const updatedMessage = await Message.findById(messageId);

      if (!updatedMessage || updatedMessage.isDeleted) {
        return;
      }

      if (updatedMessage.status === 'sent') {
        updatedMessage.status = 'delivered';
        await updatedMessage.save();
      }

      const senderSocketId = onlineUsers.get(
        String(updatedMessage.sender)
      );

      if (senderSocketId) {
        io.to(senderSocketId).emit('message_status', {
          messageId: updatedMessage._id.toString(),
          status: updatedMessage.status,
        });
      }
    } catch (error) {
      console.error('Message delivered update failed:', error);
    }
  });

  // MESSAGE SEEN
  socket.on('message_seen', async messageId => {
    try {
      if (
        !messageId ||
        !mongoose.Types.ObjectId.isValid(String(messageId))
      ) {
        return;
      }

      const updatedMessage = await Message.findById(messageId);

      if (!updatedMessage || updatedMessage.isDeleted) {
        return;
      }

      updatedMessage.status = 'seen';
      await updatedMessage.save();

      const senderId = String(updatedMessage.sender);
      const receiverId = String(updatedMessage.receiver);

      const senderSocketId = onlineUsers.get(senderId);

      if (senderSocketId) {
        io.to(senderSocketId).emit('message_status', {
          messageId: updatedMessage._id.toString(),
          status: 'seen',
        });
      }

      await updateUnreadCount(receiverId, senderId);
    } catch (error) {
      console.error('Message seen update failed:', error);
    }
  });

  // DISCONNECT
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);

    for (const [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        onlineUsers.delete(userId);

        socket.broadcast.emit('user_status', {
          userId,
          online: false,
        });

        io.emit('online_users', Array.from(onlineUsers.keys()));
        break;
      }
    }
  });
});

// =========================
// CONNECT MONGODB + START SERVER
// =========================

const PORT = process.env.PORT || 5000;

if (!process.env.MONGO_URI) {
  console.error('MONGO_URI is missing in your .env file');
  process.exit(1);
}

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
    });
  })
  .catch(error => {
    console.error('MongoDB connection failed:', error);
    process.exit(1);
  });
