const mongoose = require('mongoose');

const { Schema } = mongoose;

const publicLeadSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  business: { type: String, required: true, trim: true, maxlength: 160 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  phone: { type: String, trim: true, maxlength: 32 },
  contactPreference: {
    type: String,
    enum: ['email', 'whatsapp', 'call'],
    default: 'email',
  },
  whatsappConsent: { type: Boolean, default: false },
  message: { type: String, trim: true, maxlength: 2000, default: '' },
  source: { type: String, enum: ['point-of-sale-landing'], required: true },
}, {
  collection: 'publicLeads',
  timestamps: true,
  versionKey: false,
});

publicLeadSchema.index({ email: 1, createdAt: -1 });

module.exports = mongoose.models.PublicLead
  || mongoose.model('PublicLead', publicLeadSchema, 'publicLeads');
