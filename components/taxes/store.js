const { TaxConfig, ProductTax, CategoryTax } = require('./model');

async function addTaxConfig(taxData) {
  try {
    const taxConfig = new TaxConfig(taxData);
    const savedConfig = await taxConfig.save();
    return await TaxConfig.findById(savedConfig._id).populate('createdBy', 'name');
  } catch (error) {
    throw new Error(`Error creating tax config: ${error.message}`);
  }
}

async function listTaxConfigs(companyId) {
  try {
    return await TaxConfig.find({ 
      company: companyId,
      isActive: true 
    }).populate('createdBy', 'name').sort({ createdAt: -1 });
  } catch (error) {
    throw new Error(`Error listing tax configs: ${error.message}`);
  }
}

async function getTaxConfig(taxConfigId, companyId) {
  try {
    const taxConfig = await TaxConfig.findOne({
      _id: taxConfigId,
      company: companyId,
      isActive: true,
    }).populate('createdBy', 'name');
    if (!taxConfig) {
      throw new Error('Tax configuration not found');
    }
    return taxConfig;
  } catch (error) {
    throw new Error(`Error getting tax config: ${error.message}`);
  }
}

async function updateTaxConfig(taxConfigId, updateData, companyId) {
  try {
    const updatedData = { ...updateData, updatedAt: new Date() };
    const updatedConfig = await TaxConfig.findOneAndUpdate(
      { _id: taxConfigId, company: companyId, isActive: true },
      updatedData,
      { new: true }
    ).populate('createdBy', 'name');

    if (!updatedConfig) {
      throw new Error('Tax configuration not found');
    }
    return updatedConfig;
  } catch (error) {
    throw new Error(`Error updating tax config: ${error.message}`);
  }
}

async function removeTaxConfig(taxConfigId, companyId) {
  try {
    const removedConfig = await TaxConfig.findOneAndUpdate(
      { _id: taxConfigId, company: companyId, isActive: true },
      { isActive: false, updatedAt: new Date() },
      { new: true }
    );

    if (!removedConfig) {
      throw new Error('Tax configuration not found');
    }
    return removedConfig;
  } catch (error) {
    throw new Error(`Error removing tax config: ${error.message}`);
  }
}

async function setProductTax(productId, taxConfigId, customRate, companyId, userId) {
  try {

    const taxConfig = await TaxConfig.findOne({
      _id: taxConfigId,
      company: companyId,
      isActive: true
    });

    if (!taxConfig) {
      throw new Error('Tax configuration not found or inactive');
    }

    const existingTax = await ProductTax.findOne({
      product: productId,
      taxConfig: taxConfigId,
      company: companyId
    });

    if (existingTax) {
      existingTax.customRate = customRate;
      existingTax.isActive = true;
      existingTax.updatedAt = new Date();
      const updated = await existingTax.save();
      return await ProductTax.findById(updated.id).populate('taxConfig');
    }
    

    const productTax = new ProductTax({
      product: productId,
      taxConfig: taxConfigId,
      customRate,
      company: companyId,
      createdBy: userId
    });

    const saved = await productTax.save();
    return await ProductTax.findById(saved.id).populate('taxConfig');
  } catch (error) {
    throw new Error(`Error setting product tax: ${error.message}`);
  }
}

async function getProductTaxes(productId, companyId) {
  try {
    return await ProductTax.find({
      product: productId,
      company: companyId,
      isActive: true
    }).populate('taxConfig').sort({ createdAt: -1 });
  } catch (error) {
    throw new Error(`Error getting product taxes: ${error.message}`);
  }
}

async function removeProductTax(productId, taxConfigId, companyId) {
  try {
    const removedTax = await ProductTax.findOneAndUpdate(
      {
        product: productId,
        taxConfig: taxConfigId,
        company: companyId
      },
      { isActive: false, updatedAt: new Date() },
      { new: true }
    ).populate('taxConfig');

    if (!removedTax) {
      throw new Error('Product tax configuration not found');
    }
    return removedTax;
  } catch (error) {
    throw new Error(`Error removing product tax: ${error.message}`);
  }
}

async function setCategoryTax(categoryId, taxConfigId, defaultRate, companyId, userId) {
  try {
 
    const taxConfig = await TaxConfig.findOne({
      _id: taxConfigId,
      company: companyId,
      isActive: true
    });

    if (!taxConfig) {
      throw new Error('Tax configuration not found or inactive');
    }

    const existingTax = await CategoryTax.findOne({
      category: categoryId,
      taxConfig: taxConfigId,
      company: companyId
    });

    if (existingTax) {
      existingTax.defaultRate = defaultRate;
      existingTax.isActive = true;
      existingTax.updatedAt = new Date();
      const updated = await existingTax.save();
      return await CategoryTax.findById(updated.id).populate('taxConfig');
    }
    
    const categoryTax = new CategoryTax({
      category: categoryId,
      taxConfig: taxConfigId,
      defaultRate,
      company: companyId,
      createdBy: userId
    });

    const saved = await categoryTax.save();
    return await CategoryTax.findById(saved.id).populate('taxConfig');
  } catch (error) {
    throw new Error(`Error setting category tax: ${error.message}`);
  }
}

async function getCategoryTaxes(categoryId, companyId) {
  try {
    return await CategoryTax.find({
      category: categoryId,
      company: companyId,
      isActive: true
    }).populate('taxConfig').sort({ createdAt: -1 });
  } catch (error) {
    throw new Error(`Error getting category taxes: ${error.message}`);
  }
}

async function removeCategoryTax(categoryId, taxConfigId, companyId) {
  try {
    const removedTax = await CategoryTax.findOneAndUpdate(
      {
        category: categoryId,
        taxConfig: taxConfigId,
        company: companyId
      },
      { isActive: false, updatedAt: new Date() },
      { new: true }
    ).populate('taxConfig');

    if (!removedTax) {
      throw new Error('Category tax configuration not found');
    }
    return removedTax;
  } catch (error) {
    throw new Error(`Error removing category tax: ${error.message}`);
  }
}

async function calculateProductTaxes(productId, basePrice, companyId) {
  try {
    if (!productId || basePrice === undefined || basePrice < 0) {
      throw new Error('Invalid product ID or base price');
    }

  
    const productTaxes = await getProductTaxes(productId, companyId);
    
    if (productTaxes.length === 0) {
      return {
        basePrice: parseFloat(basePrice),
        totalTaxes: 0,
        finalPrice: parseFloat(basePrice),
        taxDetails: []
      };
    }

    const { totalTaxes, taxDetails } = productTaxes.reduce((acc, productTax) => {
      if (!productTax.taxConfig) {
        return acc;
      }

      const taxAmount = productTax.taxConfig.calculateTax(basePrice, productTax.customRate);
      
      acc.totalTaxes += taxAmount;
      acc.taxDetails.push({
        taxId: productTax.taxConfig.id,
        name: productTax.taxConfig.name,
        type: productTax.taxConfig.type,
        rate: productTax.customRate,
        amount: parseFloat(taxAmount.toFixed(2))
      });
      
      return acc;
    }, { totalTaxes: 0, taxDetails: [] });

    return {
      basePrice: parseFloat(basePrice),
      totalTaxes: parseFloat(totalTaxes.toFixed(2)),
      finalPrice: parseFloat((basePrice + totalTaxes).toFixed(2)),
      taxDetails
    };

  } catch (error) {
    console.error('Error calculating product taxes:', error);
    throw new Error(`Error calculating product taxes: ${error.message}`);
  }
}

async function calculateSaleTaxes(products, companyId) {
  try {
    if (!products || !Array.isArray(products) || products.length === 0) {
      throw new Error('Products array is required and cannot be empty');
    }

    const saleTotal = {
      subtotal: 0,
      totalTaxes: 0,
      total: 0,
      taxBreakdown: []
    };

    const taxSummary = {}; 
    const productTaxPromises = products.map(async (item) => {
      const { productId, quantity, price } = item;
      
      if (!productId || quantity <= 0 || price < 0) {
        throw new Error(`Invalid product data: ${JSON.stringify(item)}`);
      }

      const lineSubtotal = price * quantity;
     
      const productTaxes = await calculateProductTaxes(productId, price, companyId);
      const lineTaxes = productTaxes.totalTaxes * quantity;
      
      return {
        productId,
        quantity,
        price,
        lineSubtotal,
        lineTaxes,
        taxDetails: productTaxes.taxDetails
      };
    });

    const results = await Promise.all(productTaxPromises);

    results.forEach(({ lineSubtotal, lineTaxes, taxDetails, quantity }) => {
      saleTotal.subtotal += lineSubtotal;
      saleTotal.totalTaxes += lineTaxes;

    
      taxDetails.forEach(tax => {
        const taxKey = tax.taxId.toString();
        if (!taxSummary[taxKey]) {
          taxSummary[taxKey] = {
            taxId: tax.taxId,
            name: tax.name,
            type: tax.type,
            totalAmount: 0
          };
        }
        taxSummary[taxKey].totalAmount += (tax.amount * quantity);
      });
    });

    saleTotal.taxBreakdown = Object.values(taxSummary).map(tax => ({
      ...tax,
      totalAmount: parseFloat(tax.totalAmount.toFixed(2))
    }));

    saleTotal.subtotal = parseFloat(saleTotal.subtotal.toFixed(2));
    saleTotal.totalTaxes = parseFloat(saleTotal.totalTaxes.toFixed(2));
    saleTotal.total = parseFloat((saleTotal.subtotal + saleTotal.totalTaxes).toFixed(2));

    return saleTotal;
  } catch (error) {
    console.error('Error calculating sale taxes:', error);
    throw new Error(`Error calculating sale taxes: ${error.message}`);
  }
}

async function getTaxStatistics(companyId, startDate = null, endDate = null) {
  try {
    const matchStage = { company: companyId, isActive: true };
    
    if (startDate && endDate) {
      matchStage.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const taxConfigStats = await TaxConfig.aggregate([
      { $match: { company: companyId, isActive: true } },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          avgRate: { $avg: '$defaultRate' }
        }
      }
    ]);


    const productTaxCount = await ProductTax.countDocuments({
      company: companyId,
      isActive: true
    });


    const categoryTaxCount = await CategoryTax.countDocuments({
      company: companyId,
      isActive: true
    });

    return {
      taxConfigurations: taxConfigStats,
      productsWithTaxes: productTaxCount,
      categoriesWithTaxes: categoryTaxCount,
      generatedAt: new Date()
    };
  } catch (error) {
    throw new Error(`Error getting tax statistics: ${error.message}`);
  }
}

module.exports = {

  addTaxConfig,
  listTaxConfigs,
  getTaxConfig,
  updateTaxConfig,
  removeTaxConfig,
  setProductTax,
  getProductTaxes,
  removeProductTax,
  setCategoryTax,
  getCategoryTaxes,
  removeCategoryTax,
  calculateProductTaxes,
  calculateSaleTaxes,
  getTaxStatistics
};