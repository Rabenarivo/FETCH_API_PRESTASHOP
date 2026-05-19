import { parsePrestaXML, getValue } from '../config/parserXML';

const API_URL = process.env.NODE_ENV === 'production'
  ? process.env.REACT_APP_PRESTASHOP_API_URL
  : '/evals/api';

const fetchXml = async (endpoint, options = {}) => {
  const response = await fetch(`${API_URL}/${endpoint}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/xml',
      ...(options.headers || {}),
    },
    ...options,
  });

  const text = await response.text();
  const trimmed = String(text || '').trim();
  const data = trimmed.startsWith('<') ? parsePrestaXML(trimmed) : null;

  if (!response.ok) {
    throw new Error(`API stock error (${response.status})`);
  }

  return { response, text, data };
};

const getResourceList = (data, singular, plural) => {
  const fromRoot = data?.prestashop?.[singular];
  if (Array.isArray(fromRoot)) return fromRoot;
  if (fromRoot) return [fromRoot];

  const fromContainer = data?.prestashop?.[plural]?.[singular];
  if (Array.isArray(fromContainer)) return fromContainer;
  if (fromContainer) return [fromContainer];

  return [];
};

export const getProductStock = async (productId, productAttributeId = 0) => {
  const idProduct = Number(productId || 0);
  const idProductAttribute = Number(productAttributeId || 0);

  if (!idProduct) return 0;

  const endpoint = `stock_availables?display=[id,quantity]&filter[id_product]=[${idProduct}]&filter[id_product_attribute]=[${idProductAttribute}]&limit=1`;
  const { data } = await fetchXml(endpoint);
  const stocks = getResourceList(data, 'stock_available', 'stock_availables');

  if (!stocks.length) return 0;

  const quantity = Number(getValue(stocks[0]?.quantity, 0));
  return Number.isNaN(quantity) ? 0 : quantity;
};

export const addProductStock = async (productId, quantityToAdd, productAttributeId = 0) => {
  const idProduct = Number(productId || 0);
  const idProductAttribute = Number(productAttributeId || 0);
  const addedQuantity = Number.parseInt(quantityToAdd, 10);

  if (!idProduct) {
    throw new Error('Produit invalide');
  }

  if (Number.isNaN(addedQuantity) || addedQuantity < 1) {
    throw new Error('Quantite invalide (>= 1)');
  }

  const endpoint = `stock_availables?display=[id]&filter[id_product]=[${idProduct}]&filter[id_product_attribute]=[${idProductAttribute}]&limit=1`;
  const { data } = await fetchXml(endpoint);
  const stocks = getResourceList(data, 'stock_available', 'stock_availables');

  if (!stocks.length) {
    throw new Error('Aucun stock disponible pour ce produit');
  }

  const stockId = Number(getValue(stocks[0]?.id, 0));
  if (!stockId) {
    throw new Error('Stock introuvable');
  }

  const { text: stockXml } = await fetchXml(
    `stock_availables/${stockId}?display=[id,id_product,id_product_attribute,id_shop,id_shop_group,quantity,depends_on_stock,out_of_stock,location]`
  );

  const currentQuantityMatch = stockXml.match(/<quantity>([^<]*)<\/quantity>/);
  const currentQuantity = currentQuantityMatch ? Number(currentQuantityMatch[1]) || 0 : 0;
  const newQuantity = currentQuantity + addedQuantity;

  let updatedXml = stockXml.replace(
    /<quantity>([^<]*)<\/quantity>/,
    `<quantity>${newQuantity}</quantity>`
  );

  updatedXml = updatedXml.replace(/ xlink:href="[^"]*"/g, '');

  await fetchXml(`stock_availables/${stockId}`, {
    method: 'PUT',
    body: updatedXml,
  });

  return {
    productId: idProduct,
    stockId,
    addedQuantity,
    newQuantity,
  };
};
