const mongoose = require('mongoose');

const { Schema } = mongoose;

/**
 * Only a hash of the opaque browser credential is persisted.  A database
 * disclosure therefore cannot be used to create a browser session.
 */
const refreshTokenSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true, index: true },
  familyId: { type: String, required: true, index: true },
  user: { type: Schema.ObjectId, ref: 'Users', required: true, index: true },
  expiresAt: { type: Date, required: true },
  revokedAt: Date,
  revokedReason: String,
  replacedBy: { type: Schema.ObjectId, ref: 'RefreshTokens' },
  lastUsedAt: Date,
  createdIpHash: String,
  createdUserAgent: String,
}, { timestamps: true });

// Expired credentials need no application-level cleanup. Mongo removes them
// after expiry; authorization always checks expiresAt, so TTL timing is not a
// security boundary.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
refreshTokenSchema.index({ familyId: 1, revokedAt: 1 });

module.exports = mongoose.model('RefreshTokens', refreshTokenSchema, 'refreshTokens');
