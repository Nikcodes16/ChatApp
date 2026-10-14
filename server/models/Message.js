
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
      required: true,
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
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedBy: {
      type: String,
      default: null,
    },
    // Users for whom this message should be hidden
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

