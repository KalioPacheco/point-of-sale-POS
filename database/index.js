const db = require('mongoose');

db.Promise = global.Promise;

async function connect() {
  const url = process.env.DB_CONECTION_DEV;
  await db.connect(
    url,
    {
      useNewUrlParser: true,
    },
    error => {
      if (error) {
        console.log(error);
      } else {
        console.log('[db] Conectada con éxito');
      }
    },
  );
}

module.exports = connect;
