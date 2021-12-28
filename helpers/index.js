exports.getCompanyId = req => {
  const companyId = req.user.company.toString().split('"')?.[0] || '';
  return companyId;
};

exports.getUserId = req => {
  // eslint-disable-next-line no-underscore-dangle
  const userId = req.user._id.toString().split('"')?.[0] || '';
  return userId;
};
