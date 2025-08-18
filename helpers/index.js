exports.getCompanyId = req => {
  // CAMBIO: Verificar que req.user y req.user.company existen
  if (!req || !req.user) {
    console.log('No req.user found, using default company');
    return 'default-company-id';
  }
  
  // El modelo usa 'company', no 'companyId'
  if (req.user.company) {
    const companyId = req.user.company.toString().split('"')?.[0] || '';
    return companyId || 'default-company-id';
  }
  
  // Fallback: usar company por defecto
  console.log('User has no company field, using default');
  return 'default-company-id';
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
  
  console.log('User has no _id or id field');
  return '';
};