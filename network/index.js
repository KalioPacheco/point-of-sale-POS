exports.success = function (req, res, message, status) {
  if (!res.headersSent) {
    res.status(status || 200).send({
      error: '',
      body: message,
    });
  }
};

exports.error = function (req, res, message, status, details) {
  console.error(`[response error] ${details}`);
  
  if (!res.headersSent) {
    if (message === 'Login is necessary') {
      res.status(status || 401).send({
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
  }
};