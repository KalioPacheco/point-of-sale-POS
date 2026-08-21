exports.getCompanyId = req => {
  if (!req || !req.user) {
    return null;
  }

  if (req.user.company) {
    const companyRaw = req.user.company;
    const companyId = typeof companyRaw === 'string' ? companyRaw : companyRaw.toString?.();
    return companyId || null;
  }

  return null;
};

exports.getUserId = req => {
  // CAMBIO: Verificar que req.user existe
  if (!req || !req.user) {
    console.log('No req.user found for getUserId');
    return '';
  }
   // eslint-disable-next-line no-underscore-dangle
  if (req.user._id) {
    // eslint-disable-next-line no-underscore-dangle
    const userId = req.user._id.toString().split('"')?.[0] || '';
    return userId;
  }
  
  if (req.user.id) {
    const userId = req.user.id.toString().split('"')?.[0] || '';
    return userId;
  }

  if (req.user.userId) {
    const userId = req.user.userId.toString().split('"')?.[0] || '';
    return userId;
  }
  
  console.log('User has no _id or id field');
  return '';
};
