const mongoose = require('mongoose');

const replyToSchema = new mongoose.Schema(
  {
    messageId: { type: String, default: null },
    text: { type: String, default: '' },
    sender: { type: String, default: '' },
  },
  { _id: false },
);

const messageSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      default: '',
    },

    sender: {
      type: String,
      required: true,
    },

    receiver: {
      type: String,
      default: '',
    },

    status: {
      type: String,
      enum: ['sent', 'delivered', 'seen'],
      default: 'sent',
    },

    roomId: {
      type: String,
      required: true,
    },

    replyTo: {
      type: replyToSchema,
      default: null,
    },

    type: {
      type: String,
      enum: [
        'text',
        'image',
        'video',
        'document',
        'audio',
        'location',
        'contact',
      ],
      default: 'text',
    },

    mediaUrl: {
      type: String,
      default: '',
    },

    fileName: {
      type: String,
      default: '',
    },

    mimeType: {
      type: String,
      default: '',
    },

    fileSize: {
      type: Number,
      default: 0,
    },

    location: {
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
      address: { type: String, default: '' },
    },

    contact: {
      name: { type: String, default: '' },
      phone: { type: String, default: '' },
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },

    deletedBy: {
      type: String,
      default: null,
    },

    deletedFor: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model('Message', messageSchema);
