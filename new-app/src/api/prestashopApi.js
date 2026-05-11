// Prestashop API service
import { parsePrestaXML, getValue, getLangValue } from '../config/parserXML';

// Use local proxy in development, full URL in production
const API_URL = process.env.NODE_ENV === 'production' 
  ? process.env.REACT_APP_PRESTASHOP_API_URL 
  : '/evals/api';

const getAuthHeader = () => {
  return {
    'Content-Type': 'application/xml'
  };
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

// Charge une ressource XML PrestaShop puis renvoie la liste d'objets correspondante.
const fetchResourceList = async (endpoint, singular, plural) => {
  const response = await fetch(`${API_URL}/${endpoint}`, {
    method: 'GET',
    headers: getAuthHeader()
  });

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

const createTaxRateByGroupFromRules = (taxRules, taxRateById) => {
  const map = new Map();

  // Ici on prend la première règle trouvée pour le groupe (cas simple et lisible).
  taxRules.forEach((rule) => {
    const groupId = Number(getValue(rule?.id_tax_rules_group, 0));
    if (!groupId || map.has(groupId)) return;

    const taxId = Number(getValue(rule?.id_tax, 0));
    map.set(groupId, taxRateById.get(taxId) || 0);
  });

  return map;
};

const completeTaxRatesFromGroupNames = (taxRuleGroups, taxRateByGroup) => {
  // Fallback: certains imports créent des groupes sans tax_rule.
  // On essaie donc d'extraire le taux depuis le nom du groupe: "TVA 20.000%".
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

const buildTaxRateByGroupMap = async () => {
  const [taxRules, taxes, taxRuleGroups] = await Promise.all([
    fetchResourceList('tax_rules?display=[id_tax_rules_group,id_tax,id_country,id_state]&limit=1000', 'tax_rule', 'tax_rules'),
    fetchResourceList('taxes?display=[id,rate]&limit=1000', 'tax', 'taxes'),
    fetchResourceList('tax_rule_groups?display=[id,name]&limit=1000', 'tax_rule_group', 'tax_rule_groups')
  ]);

  const taxRateById = createTaxRateByIdMap(taxes);
  const taxRateByGroup = createTaxRateByGroupFromRules(taxRules, taxRateById);
  completeTaxRatesFromGroupNames(taxRuleGroups, taxRateByGroup);
  return taxRateByGroup;
};

// Get all products
export const getProducts = async () => {
  try {
    const [productsResponse, taxRateByGroup] = await Promise.all([
      fetch(`${API_URL}/products?display=[id,name,price,id_tax_rules_group]&sort=[id_ASC]&limit=200`, {
        method: 'GET',
        headers: getAuthHeader()
      }),
      buildTaxRateByGroupMap().catch(() => new Map())
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
        id_tax_rules_group: idTaxRulesGroup,
        href: product?.['xlink:href'] || '',
      };
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    throw error;
  }
};

// Get single product details
export const getProductDetails = async (productId) => {
  try {
    const response = await fetch(`${API_URL}/products/${productId}`, {
      method: 'GET',
      headers: getAuthHeader()
    });

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
