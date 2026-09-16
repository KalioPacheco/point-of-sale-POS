const Model = require('./model');

function add(lead) {
  return new Model(lead).save();
}

module.exports = { add };
