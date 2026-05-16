/**
 * productApi.js
 *
 * API produits:
 * - lecture des produits
 * - calcul du prix TTC (a partir du HT + taxes)
 * - lecture d'un produit detaille
 */

import { parsePrestaXML, getValue, getLangValue } from '../config/parserXML';

const API_URL = process.env.NODE_ENV === 'production'
  ? process.env.REACT_APP_PRESTASHOP_API_URL
  : '/evals/api';

const getAuthHeader = () => ({
  'Content-Type': 'application/xml',
});

const getFetchOptions = () => ({
  method: 'GET',
  headers: getAuthHeader(),
  credentials: 'include',
});

const getResourceList = (data, singular, plural) => {
  // Harmonise les formats possibles de la reponse PrestaShop en tableau.
  const fromRoot = data?.prestashop?.[singular];
  if (Array.isArray(fromRoot)) return fromRoot;
  if (fromRoot) return [fromRoot];

  const fromContainer = data?.prestashop?.[plural]?.[singular];
  if (Array.isArray(fromContainer)) return fromContainer;
  if (fromContainer) return [fromContainer];

  return [];
};

const toNumber = (value, defaultValue = 0) => {
  const parsed = Number.parseFloat(String(getValue(value, defaultValue)).replace(',', '.'));
  return Number.isNaN(parsed) ? defaultValue : parsed;
};

const extractPercentFromLabel = (label) => {
  const text = String(label || '');
  const match = text.match(/([0-9]+(?:[.,][0-9]+)?)\s*%/);
  if (!match) return null;
  const percent = Number.parseFloat(match[1].replace(',', '.'));
  return Number.isNaN(percent) ? null : percent;
};

const fetchResourceList = async (endpoint, singular, plural) => {
  const response = await fetch(`${API_URL}/${endpoint}`, getFetchOptions());

  if (!response.ok) {
    throw new Error(`API error ${plural}: ${response.status}`);
  }

  const xml = await response.text();
  const data = parsePrestaXML(xml);
  return getResourceList(data, singular, plural);
};

const createTaxRateByIdMap = (taxes) => {
  const map = new Map();

  taxes.forEach((tax) => {
    const id = Number(getValue(tax?.id, 0));
    if (!id) return;
    map.set(id, toNumber(tax?.rate, 0));
  });

  return map;
};

const createTaxRateByGroupFromRules = (taxRules, taxRateById, taxContext = {}) => {
  const idCountry = Number(taxContext?.idCountry || 0);
  const idState = Number(taxContext?.idState || 0);
  const map = new Map();
  const scoreByGroup = new Map();

  taxRules.forEach((rule) => {
    const groupId = Number(getValue(rule?.id_tax_rules_group, 0));
    if (!groupId) return;

    const ruleCountry = Number(getValue(rule?.id_country, 0)) || 0;
    const ruleState = Number(getValue(rule?.id_state, 0)) || 0;

    if (ruleCountry > 0 && idCountry > 0 && ruleCountry !== idCountry) return;
    if (ruleCountry > 0 && idCountry <= 0) return;
    if (ruleState > 0 && idState > 0 && ruleState !== idState) return;
    if (ruleState > 0 && idState <= 0) return;

    const score = (ruleCountry > 0 ? 2 : 0) + (ruleState > 0 ? 1 : 0);
    const previousScore = scoreByGroup.has(groupId) ? scoreByGroup.get(groupId) : -1;
    if (score < previousScore) return;

    const taxId = Number(getValue(rule?.id_tax, 0));
    map.set(groupId, taxRateById.get(taxId) || 0);
    scoreByGroup.set(groupId, score);
  });

  return map;
};

const completeTaxRatesFromGroupNames = (taxRuleGroups, taxRateByGroup) => {
  taxRuleGroups.forEach((group) => {
    const groupId = Number(getValue(group?.id, 0));
    if (!groupId || taxRateByGroup.has(groupId)) return;

    const name = String(getValue(group?.name, '') || '');
    const rate = extractPercentFromLabel(name);
    if (rate !== null) {
      taxRateByGroup.set(groupId, rate);
    }
  });
};

const lireContexteTaxeClient = async (idClient = 0) => {
  const clientId = Number(idClient || 0);
  if (!clientId) return { idCountry: 0, idState: 0 };

  try {
    const addresses = await fetchResourceList(
      `addresses?filter[id_customer]=[${clientId}]&filter[deleted]=[0]&display=[id,id_country,id_state]&sort=[id_ASC]&limit=1`,
      'address',
      'addresses'
    );

    if (!addresses.length) return { idCountry: 0, idState: 0 };
    return {
      idCountry: Number(getValue(addresses[0]?.id_country, 0)) || 0,
      idState: Number(getValue(addresses[0]?.id_state, 0)) || 0,
    };
  } catch {
    return { idCountry: 0, idState: 0 };
  }
};

const buildTaxRateByGroupMap = async (taxContext = {}) => {
  // On lit les tables taxes en parallele puis on construit un map: id_groupe_taxe -> taux.
  const [taxRules, taxes, taxRuleGroups] = await Promise.all([
    fetchResourceList('tax_rules?display=[id_tax_rules_group,id_tax,id_country,id_state]&limit=1000', 'tax_rule', 'tax_rules'),
    fetchResourceList('taxes?display=[id,rate]&limit=1000', 'tax', 'taxes'),
    fetchResourceList('tax_rule_groups?display=[id,name]&limit=1000', 'tax_rule_group', 'tax_rule_groups'),
  ]);

  const taxRateById = createTaxRateByIdMap(taxes);
  const taxRateByGroup = createTaxRateByGroupFromRules(taxRules, taxRateById, taxContext);
  completeTaxRatesFromGroupNames(taxRuleGroups, taxRateByGroup);
  return taxRateByGroup;
};

export const getProducts = async (idClient = 0) => {
  // Charge les produits + leurs taux de taxe, puis calcule prix TTC.
  try {
    const taxContext = await lireContexteTaxeClient(idClient);
    const [productsResponse, taxRateByGroup] = await Promise.all([
      fetch(`${API_URL}/products?display=[id,name,price,wholesale_price,id_tax_rules_group]&sort=[id_ASC]&limit=200`, getFetchOptions()),
      buildTaxRateByGroupMap(taxContext).catch(() => new Map()),
    ]);

    if (!productsResponse.ok) {
      throw new Error(`API error: ${productsResponse.status}`);
    }

    const xmlData = await productsResponse.text();
    const data = parsePrestaXML(xmlData);
    const products = getResourceList(data, 'product', 'products');

    return products.map((product) => {
      const idTaxRulesGroup = Number(getValue(product?.id_tax_rules_group, 0)) || 0;
      const prixHt = toNumber(product?.price, 0);
      const tauxTaxe = taxRateByGroup.get(idTaxRulesGroup) || 0;
      const prixTtc = prixHt * (1 + tauxTaxe / 100);

      return {
        id: Number(getValue(product?.id, 0)),
        name: getLangValue(product?.name, 1) || `Produit #${getValue(product?.id, '')}`,
        price: prixHt,
        prix_ht: prixHt,
        prix_ttc: prixTtc,
        taxes: tauxTaxe,
        prix_achat: toNumber(product?.wholesale_price, 0),
        id_tax_rules_group: idTaxRulesGroup,
        href: product?.['xlink:href'] || '',
      };
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    throw error;
  }
};

export const getProductDetails = async (productId) => {
  try {
    const response = await fetch(`${API_URL}/products/${productId}`, getFetchOptions());

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const xmlData = await response.text();
    const data = parsePrestaXML(xmlData);
    const product = data?.prestashop?.product;
    return Array.isArray(product) ? product[0] : product;
  } catch (error) {
    console.error(`Error fetching product ${productId}:`, error);
    throw error;
  }
};

/**
 * Retourne le stock disponible d'un produit.
 * On lit la table stock_availables pour le produit courant.
 */
export const getProductStock = async (productId) => {
  if (!productId) return 0;

  const response = await fetch(
    `${API_URL}/stock_availables?display=[id,id_product,quantity]&filter[id_product]=[${productId}]&limit=1`,
    getFetchOptions()
  );

  if (!response.ok) {
    throw new Error(`API error stock: ${response.status}`);
  }

  const xmlData = await response.text();
  const data = parsePrestaXML(xmlData);
  const stocks = getResourceList(data, 'stock_available', 'stock_availables');
  if (!stocks.length) return 0;

  return toNumber(stocks[0]?.quantity, 0);
};
