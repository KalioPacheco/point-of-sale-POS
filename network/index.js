exports.success = function (req, res, message, status) {
  res.status(status || 200).send({
    error: '',
    body: message,
  });
};

exports.error = function (req, res, message, status, details) {
  console.error(`[response error] ${details}`);
  if (message === 'Login is necessary') {
    res.status(status || 500).send({
      error: message,
      loginIsRequired: true,
      body: '',
    });
  } else {
    res.status(status || 500).send({
      error: message,
      body: '',
    });
  }
};
