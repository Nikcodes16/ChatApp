
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
    },

    about: {
      type: String,
      default: '',
      maxlength: 150,
    },

    profilePhoto: {
      type: String,
      default: '',
    },
    
    isPremium: {
      type: Boolean,
      default: false,
    },

    premiumUntil: {
      type: Date,
      default: null,
    },

    premiumOrderId: {
      type: String,
      default: null,
    },

    premiumPaymentId: {
      type: String,
      default: null,
    },

  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model('User', userSchema);
