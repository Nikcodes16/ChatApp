const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

require('dotenv').config();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
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

//razorpay

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

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
// RAZORPAY: CREATE TEST ORDER
// =========================

app.post('/payments/create-order', async (req, res) => {
  try {
    if (
      !process.env.RAZORPAY_KEY_ID ||
      !process.env.RAZORPAY_KEY_SECRET
    ) {
      return res.status(500).json({
        message: 'Razorpay keys are not configured',
      });
    }

    const order = await razorpay.orders.create({
      amount: 1000, // ₹10.00, amount is in paise
      currency: 'INR',
      receipt: `chatapp_${Date.now()}`,
    });

    return res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error('Create Razorpay order error:', error);

    return res.status(500).json({
      message: 'Unable to create payment order',
    });
  }
});

// =========================
// GET CHAT HISTORY
// =========================

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

    // First, find messages using the exact roomId.
    const messages = await Message.find({
      roomId,
      deletedFor: { $ne: userId },
    })
      .sort({ createdAt: 1 })
      .lean();

    console.log('[GET /messages]', {
      roomId,
      userId,
      count: messages.length,
    });

    return res.json(messages);
  } catch (error) {
    console.error('GET /messages error:', error);

    return res.status(500).json({
      message: 'Failed to fetch messages',
    });
  }
});
// =========================
// UNREAD MESSAGE COUNTS
// =========================

app.get('/unread-counts', async (req, res) => {
  try {
    const userId = String(req.query.userId || '').trim();

    if (!userId) {
      return res.status(400).json({
        message: 'userId is required',
      });
    }

    const unreadMessages = await Message.aggregate([
      {
        $match: {
          receiver: userId,
          status: { $ne: 'seen' },
          isDeleted: { $ne: true },
          deletedFor: { $ne: userId },
        },
      },
      {
        $group: {
          _id: '$sender',
          count: { $sum: 1 },
        },
      },
    ]);

    const counts = {};

    unreadMessages.forEach((item) => {
      counts[item._id] = item.count;
    });

    res.json(counts);
  } catch (error) {
    console.error('Unread counts error:', error);

    res.status(500).json({
      message: 'Failed to get unread counts',
    });
  }
});

// =========================
// GET USERS
// =========================

app.get('/users', async (req, res) => {
  try {
    const users = await User.find({})
      .select('-password')
      .lean();

    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);

    res.status(500).json({
      message: 'Failed to fetch users',
    });
  }
});

// =========================
// PUBLIC USER PROFILE
// =========================

function getPublicProfile(user) {
  if (!user) return null;

  const data =
    typeof user.toObject === 'function'
      ? user.toObject()
      : { ...user };

  delete data.password;

  return data;
}

// =========================
// GET PROFILE
// =========================

app.get('/profile/:userId', async (req, res) => {
  try {
    const user = await User.findById(
      req.params.userId
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        message: 'User not found',
      });
    }

    res.json(getPublicProfile(user));
  } catch (error) {
    console.error('Get profile error:', error);

    res.status(500).json({
      message: 'Failed to fetch profile',
    });
  }
});

// =========================
// UPDATE PROFILE
// =========================

app.put('/profile/:userId', async (req, res) => {
  try {
    const allowedFields = [
      'name',
      'username',
      'bio',
      'about',
      'profilePhoto',
      'avatar',
      'phone',
    ];

    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { $set: updates },
      {
        new: true,
        runValidators: true,
      }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        message: 'User not found',
      });
    }

    res.json({
      message: 'Profile updated successfully',
      user: getPublicProfile(user),
    });
  } catch (error) {
    console.error('Update profile error:', error);

    res.status(500).json({
      message: 'Failed to update profile',
    });
  }
});

// =========================
// PROFILE PHOTO UPLOAD
// =========================

app.post(
  '/upload/profile-photo/:userId',
  upload.single('photo'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          message: 'Please select a photo',
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

      const user = await User.findById(
        req.params.userId
      );

      if (!user) {
        return res.status(404).json({
          message: 'User not found',
        });
      }

      const uploadResult = await new Promise(
        (resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: 'chatapp/profile-photos',
              resource_type: 'image',
            },
            (error, result) => {
              if (error) return reject(error);
              resolve(result);
            }
          );

          Readable.from(req.file.buffer).pipe(stream);
        }
      );

      const photoUrl = uploadResult.secure_url;

      if (user.schema.path('profilePhoto')) {
        user.profilePhoto = photoUrl;
      } else if (user.schema.path('avatar')) {
        user.avatar = photoUrl;
      } else {
        user.profilePhoto = photoUrl;
      }

      await user.save();

      res.json({
        message: 'Profile photo uploaded successfully',
        user: getPublicProfile(user),
      });
    } catch (error) {
      console.error('Profile photo upload error:', error);

      res.status(500).json({
        message: 'Failed to upload profile photo',
      });
    }
  }
);

// =========================
// REGISTER
// =========================

app.post('/register', async (req, res) => {
  try {
    const { name, username, email, password } = req.body;

    if (!name || !password || !(username || email)) {
      return res.status(400).json({
        message: 'Name, username/email and password are required',
      });
    }

    const normalizedEmail = email
      ? String(email).trim().toLowerCase()
      : '';

    const normalizedUsername = username
      ? String(username).trim()
      : '';

    const existingUser = await User.findOne({
      $or: [
        ...(normalizedEmail
          ? [{ email: normalizedEmail }]
          : []),
        ...(normalizedUsername
          ? [{ username: normalizedUsername }]
          : []),
      ],
    });

    if (existingUser) {
      return res.status(409).json({
        message: 'User already exists',
      });
    }

    const hashedPassword = await bcrypt.hash(
      String(password),
      10
    );

    const user = await User.create({
      name: String(name).trim(),
      ...(normalizedUsername
        ? { username: normalizedUsername }
        : {}),
      ...(normalizedEmail
        ? { email: normalizedEmail }
        : {}),
      password: hashedPassword,
    });

    res.status(201).json({
      message: 'Registration successful',
      user: getPublicProfile(user),
    });
  } catch (error) {
    console.error('Register error:', error);

    res.status(500).json({
      message: 'Registration failed',
    });
  }
});

// =========================
// LOGIN
// =========================

app.post('/login', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if ((!username && !email) || !password) {
      return res.status(400).json({
        message: 'Username/email and password are required',
      });
    }

    const loginValue = String(
      username || email
    ).trim();

    const user = await User.findOne({
      $or: [
        { username: loginValue },
        { email: loginValue.toLowerCase() },
      ],
    });

    if (!user) {
      return res.status(401).json({
        message: 'Invalid username/email or password',
      });
    }

    let passwordMatches = await bcrypt.compare(
      String(password),
      user.password
    );

    // Support migration from old plain-text passwords.
    if (!passwordMatches && user.password === String(password)) {
      user.password = await bcrypt.hash(
        String(password),
        10
      );

      await user.save();
      passwordMatches = true;
    }

    if (!passwordMatches) {
      return res.status(401).json({
        message: 'Invalid username/email or password',
      });
    }

    const token = jwt.sign(
  { userId: user._id.toString() },
  process.env.JWT_SECRET,
  { expiresIn: '7d' },
);

res.json({
  message: 'Login successful',
  token,
  user: getPublicProfile(user),
});
  } catch (error) {
    console.error('Login error:', error);

    res.status(500).json({
      message: 'Login failed',
    });
  }
});
// =========================
// CHAT MEDIA UPLOAD
// =========================

const chatUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // Maximum 20 MB
    files: 1,
  },
});

const allowedChatMimeTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',

  'video/mp4',
  'video/quicktime',

  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',

  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/wav',
  'audio/ogg',
];

app.post(
  '/upload/chat-media/:userId',
  (req, res, next) => {
    chatUpload.single('file')(req, res, (error) => {
      if (!error) {
        return next();
      }

      return res.status(400).json({
        message:
          error.code === 'LIMIT_FILE_SIZE'
            ? 'File must be 20 MB or smaller.'
            : 'Invalid file upload.',
      });
    });
  },
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
          message: 'Please select a file',
        });
      }

      if (!allowedChatMimeTypes.includes(req.file.mimetype)) {
        return res.status(415).json({
          message: 'This file type is not supported',
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

      const mimeType = req.file.mimetype;

      const resourceType = mimeType.startsWith('image/')
        ? 'image'
        : mimeType.startsWith('video/') ||
            mimeType.startsWith('audio/')
          ? 'video'
          : 'raw';

      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'chatapp/chat-media',
            resource_type: resourceType,
            use_filename: true,
            unique_filename: true,
          },
          (error, uploadedFile) => {
            if (error) {
              return reject(error);
            }

            if (!uploadedFile) {
              return reject(
                new Error('Cloudinary returned no upload result')
              );
            }

            resolve(uploadedFile);
          }
        );

        Readable.from(req.file.buffer).pipe(stream);
      });

      return res.json({
        mediaUrl: result.secure_url,
        fileName: req.file.originalname,
        mimeType,
        fileSize: req.file.size,
      });
    } catch (error) {
      console.error('CHAT MEDIA UPLOAD ERROR:', error);

      return res.status(500).json({
        message: 'Failed to upload chat attachment',
      });
    }
  }
);
// =========================
// ONLINE USERS
// =========================

const onlineUsers = new Map();

// =========================
// UPDATE UNREAD COUNTS
// =========================

async function updateUnreadCount(receiverId, senderId) {
  try {
    if (!receiverId || !senderId) return;

    const receiver = String(receiverId);
    const sender = String(senderId);

    const count = await Message.countDocuments({
      receiver,
      sender,
      status: { $ne: 'seen' },
      isDeleted: { $ne: true },
      deletedFor: { $ne: receiver },
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

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('user_online', (userId) => {
    if (!userId) return;

    const id = String(userId);
    onlineUsers.set(id, socket.id);

    io.emit('online_users', Array.from(onlineUsers.keys()));

    socket.broadcast.emit('user_status', {
      userId: id,
      online: true,
    });
  });

  socket.on('join_room', (roomId) => {
    if (!roomId) return;

    socket.join(String(roomId));
    console.log('JOINED ROOM:', String(roomId));
  });

  socket.on('typing', (data) => {
    if (!data?.roomId || !data?.userId) return;

    socket.to(String(data.roomId)).emit('user_typing', {
      roomId: String(data.roomId),
      userId: String(data.userId),
      isTyping: Boolean(data.isTyping),
    });
  });

  // =========================
  // SEND TEXT / MEDIA / LOCATION / CONTACT
  // =========================

  socket.on('send_message', async (message) => {
    try {
      const senderId = String(message?.sender || '').trim();
      const receiverId = String(message?.receiver || '').trim();
      const roomId = String(message?.roomId || '').trim();
      const text =
        typeof message?.text === 'string'
          ? message.text.trim()
          : '';

      const allowedTypes = [
        'text',
        'image',
        'video',
        'document',
        'audio',
        'location',
        'contact',
      ];

      const type = allowedTypes.includes(message?.type)
        ? message.type
        : 'text';

      const hasMedia =
        ['image', 'video', 'document', 'audio'].includes(type) &&
        typeof message?.mediaUrl === 'string' &&
        message.mediaUrl.trim().length > 0;

      const latitude = Number(message?.location?.latitude);
      const longitude = Number(message?.location?.longitude);

      const hasLocation =
        type === 'location' &&
        Number.isFinite(latitude) &&
        Number.isFinite(longitude);

      const contactName = String(
        message?.contact?.name || ''
      ).trim();

      const hasContact =
        type === 'contact' && contactName.length > 0;

      if (!senderId || !receiverId || !roomId) {
        console.log('Message missing sender, receiver, or roomId');
        return;
      }

      if (type === 'text' && !text) return;
      if (
        ['image', 'video', 'document', 'audio'].includes(type) &&
        !hasMedia
      ) return;
      if (type === 'location' && !hasLocation) return;
      if (type === 'contact' && !hasContact) return;

      let replyTo = null;

      if (
        message.replyTo?.messageId &&
        mongoose.Types.ObjectId.isValid(
          String(message.replyTo.messageId)
        )
      ) {
        const originalMessage = await Message.findOne({
          _id: message.replyTo.messageId,
          roomId,
        }).lean();

        if (originalMessage) {
          replyTo = {
            messageId: originalMessage._id.toString(),
            text: originalMessage.isDeleted
              ? 'This message was deleted'
              : originalMessage.text ||
                originalMessage.fileName ||
                'Attachment',
            sender: String(originalMessage.sender),
          };
        }
      }

      const savedMessage = await Message.create({
        text,
        sender: senderId,
        receiver: receiverId,
        roomId,
        status: 'sent',
        replyTo,
        type,
        mediaUrl: hasMedia ? message.mediaUrl.trim() : '',
        fileName: String(message?.fileName || ''),
        mimeType: String(message?.mimeType || ''),
        fileSize: Number.isFinite(Number(message?.fileSize))
          ? Number(message.fileSize)
          : 0,
        location: hasLocation
          ? {
              latitude,
              longitude,
              address: String(message?.location?.address || ''),
            }
          : undefined,
        contact: hasContact
          ? {
              name: contactName,
              phone: String(message?.contact?.phone || ''),
            }
          : undefined,
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
        type: savedMessage.type || 'text',
        mediaUrl: savedMessage.mediaUrl || '',
        fileName: savedMessage.fileName || '',
        mimeType: savedMessage.mimeType || '',
        fileSize: savedMessage.fileSize || 0,
        location: savedMessage.location || null,
        contact: savedMessage.contact || null,
        isDeleted: false,
        createdAt: savedMessage.createdAt,
      };

      socket.emit('message_sent', {
        ...messageData,
        clientTempId: message?.clientTempId || null,
      });

      socket.to(roomId).emit('receive_message', messageData);

      await updateUnreadCount(receiverId, senderId);
    } catch (error) {
      console.error('Message save failed:', error);
    }
  });
    // =========================
  // DELETE MESSAGE FOR EVERYONE
  // =========================

  socket.on('delete_message', async (data) => {
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

      io.to(String(message.roomId)).emit('message_deleted', {
        messageId: message._id.toString(),
        roomId: String(message.roomId),
        text: 'This message was deleted',
        isDeleted: true,
      });

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

  // =========================
  // DELETE MESSAGE FOR ME
  // =========================

  socket.on('delete_message_for_me', async (data) => {
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
        $or: [
          { sender: userId },
          { receiver: userId },
        ],
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

  // =========================
  // MESSAGE DELIVERED
  // =========================

  socket.on('message_delivered', async (messageId) => {
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

  // =========================
  // MESSAGE SEEN
  // =========================

  socket.on('message_seen', async (messageId) => {
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

  // =========================
  // DISCONNECT
  // =========================

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);

    for (const [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        onlineUsers.delete(userId);

        socket.broadcast.emit('user_status', {
          userId,
          online: false,
        });

        io.emit(
          'online_users',
          Array.from(onlineUsers.keys())
        );

        break;
      }
    }
  });
});

// =========================
// CONNECT MONGODB + START
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
  .catch((error) => {
    console.error('MongoDB connection failed:', error);
    process.exit(1);
  });
