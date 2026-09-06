const mongoose = require('mongoose');

async function connect() {
  await mongoose.connect(process.env.DB_CONECTION_DEV, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 });
}
module.exports = connect;
