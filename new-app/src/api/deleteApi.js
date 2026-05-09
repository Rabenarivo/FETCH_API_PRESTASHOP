import { parsePrestaXML, getCollection, getValue } from '../config/parserXML';

const API_URL =
  process.env.NODE_ENV === 'production'
    ? process.env.REACT_APP_PRESTASHOP_API_URL
    : '/evals/api';

// APIs autorisees pour une reinitialisation partielle.
export const DELETE_API_GROUPS = {
  catalogue: [
    'products',
    'categories',
    'combinations',
    'product_options',
    'product_option_values',
    'product_features',
    'product_feature_values',
    'tags',
    'manufacturers',
    'suppliers',
    'product_suppliers',
    'images',
    'attachments',
    'customizations',
    'product_customization_fields',
    'specific_prices',
    'specific_price_rules',
  ],
  salesAndCustomers: [
    'customers',
    'addresses',
    'guests',
    'carts',
    'orders',
    'order_details',
    'order_histories',
    'order_invoices',
    'order_payments',
    'order_slip',
    'order_cart_rules',
    'deliveries',
    'messages',
    'customer_threads',
    'customer_messages',
  ],
  pricingRules: ['cart_rules'],
};

// APIs interdites en DELETE par le webservice PrestaShop.
export const FORBIDDEN_DELETE_APIS = [
  'stocks',
  'stock_movements',
  'supply_orders',
  'supply_order_details',
  'supply_order_histories',
  'supply_order_receipt_histories',
];

// IDs a ignorer par ressource (ex: categories par defaut).
// Ces IDs ne peuvent pas etre supprimes (erreur 88 = "Id wasn't deleted").
const IDS_TO_IGNORE = {
  categories: [1, 2], // Racine et "Non classé" (défaut PrestaShop)
};

// Ressources pour lesquelles on ignore silencieusement l'erreur 88.
// Ces erreurs sont normales et ne bloquent pas le reset.
const IGNORE_ERROR_88_FOR = ['products'];

export const ALLOWED_DELETE_APIS = [
  ...DELETE_API_GROUPS.catalogue,
  ...DELETE_API_GROUPS.salesAndCustomers,
  ...DELETE_API_GROUPS.pricingRules,
];

// Ordre valide de suppression: enfants -> parents.
// Cet ordre couvre 100% des APIs autorisees ci-dessus.
export const DELETE_ORDER = [
  'customer_messages',
  'customer_threads',
  'messages',
  'order_details',
  'order_histories',
  'order_invoices',
  'order_payments',
  'order_slip',
  'order_cart_rules',
  'deliveries',
  'orders',
  'carts',
  'guests',
  'addresses',
  'customers',
  'customizations',
  'product_customization_fields',
  'combinations',
  'specific_prices',
  'product_suppliers',
  'attachments',
  'images',
  'products',
  'tags',
  'product_option_values',
  'product_options',
  'product_feature_values',
  'product_features',
  'specific_price_rules',
  'cart_rules',
  'suppliers',
  'manufacturers',
  'categories',
];

const IRREGULAR_SINGULAR = {
  addresses: 'address',
  categories: 'category',
  companies: 'company',
  countries: 'country',
  deliveries: 'delivery',
  product_features: 'product_feature',
  product_feature_values: 'product_feature_value',
  product_options: 'product_option',
  product_option_values: 'product_option_value',
  product_suppliers: 'product_supplier',
  specific_prices: 'specific_price',
  specific_price_rules: 'specific_price_rule',
  customer_threads: 'customer_thread',
  customer_messages: 'customer_message',
  order_details: 'order_detail',
  order_histories: 'order_history',
  order_invoices: 'order_invoice',
  order_payments: 'order_payment',
  order_cart_rules: 'order_cart_rule',
};

// Convertit un nom de ressource pluriel -> singulier.
// Exemple: categories -> category, products -> product.
const singularFromResource = (resource) => {
  if (IRREGULAR_SINGULAR[resource]) return IRREGULAR_SINGULAR[resource];
  if (resource.endsWith('ies')) return `${resource.slice(0, -3)}y`;
  if (resource.endsWith('s')) return resource.slice(0, -1);
  return resource;
};

// Appel HTTP unique pour toute la logique DELETE.
// Retourne toujours un objet parse de l'XML PrestaShop.
const fetchXml = async (path, options = {}) => {
  // Timeout de 10 secondes par requete.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${API_URL}/${path}`, {
      // Envoie aussi les cookies de session si necessaire.
      credentials: 'include',
      signal: controller.signal,
      ...options,
    });

    clearTimeout(timeoutId);

    const xml = await response.text();
    const data = xml ? parsePrestaXML(xml) : { prestashop: {} };

    if (!response.ok) {
      const errorMessage = data?.prestashop?.errors?.error
        ? JSON.stringify(data.prestashop.errors.error)
        : `HTTP ${response.status}`;
      throw new Error(`${options.method || 'GET'} /${path} failed: ${errorMessage}`);
    }

    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout for /${path} (10s)`);
    }
    throw error;
  }
};

// Lit tous les IDs d'une ressource (du plus grand au plus petit).
// Limite a 200 pour acelerer (assez pour eviter timeouts).
const listIdsForResource = async (resource) => {
  const data = await fetchXml(`${resource}?display=[id]&sort=[id_DESC]&limit=200`);

  const singular = singularFromResource(resource);
  const listNode = data?.prestashop?.[resource]?.[singular];

  const ignoreList = IDS_TO_IGNORE[resource] || [];

  if (!listNode) {
    const direct = getCollection(data, singular);
    return direct
      .map((item) => Number(getValue(item.id, 0)))
      .filter((id) => Number.isInteger(id) && id > 0 && !ignoreList.includes(id));
  }

  const items = Array.isArray(listNode) ? listNode : [listNode];

  return items
    .map((item) => Number(getValue(item.id, 0)))
    .filter((id) => Number.isInteger(id) && id > 0 && !ignoreList.includes(id));
};

// Supprime un enregistrement par son ID.
// Tolerant a l'erreur 88 pour certaines ressources (contraintes PrestaShop).
const deleteOne = async (resource, id) => {
  try {
    await fetchXml(`${resource}/${id}`, { method: 'DELETE' });
  } catch (error) {
    // Erreur 88 = PrestaShop refuse la suppression (contrainte métier).
    // On l'ignore silencieusement pour certaines ressources.
    if (IGNORE_ERROR_88_FOR.includes(resource) && error.message.includes('88')) {
      console.log(`[DELETE] ${resource}/${id} skipped (error 88 - protected by PrestaShop)`);
      return;
    }
    throw error;
  }
};

// Verifie la qualite du plan de suppression.
export const verifyDeleteOrder = () => {
  const duplicates = DELETE_ORDER.filter((resource, index) => DELETE_ORDER.indexOf(resource) !== index);
  const forbiddenInOrder = DELETE_ORDER.filter((resource) => FORBIDDEN_DELETE_APIS.includes(resource));
  const missing = ALLOWED_DELETE_APIS.filter((resource) => !DELETE_ORDER.includes(resource));
  const unexpected = DELETE_ORDER.filter((resource) => !ALLOWED_DELETE_APIS.includes(resource));

  return {
    isValid: duplicates.length === 0 && forbiddenInOrder.length === 0 && missing.length === 0 && unexpected.length === 0,
    duplicates,
    forbiddenInOrder,
    missing,
    unexpected,
  };
};

// Execute la reinitialisation partielle selon DELETE_ORDER.
// Flux simple:
// 1) verifier l'ordre
// 2) lister les IDs de la ressource
// 3) supprimer un par un
// 4) produire un resume final
export const runPartialReset = async ({
  onProgress,
  stopOnError = false,
} = {}) => {
  const orderCheck = verifyDeleteOrder();

  if (!orderCheck.isValid) {
    throw new Error(`DELETE_ORDER invalide: ${JSON.stringify(orderCheck)}`);
  }

  const summary = {
    deleted: [],
    skipped: [],
    failed: [],
  };

  for (const resource of DELETE_ORDER) {
    try {
      console.log(`[DELETE] Fetching IDs for ${resource}...`);
      const ids = await listIdsForResource(resource);
      const ignoreList = IDS_TO_IGNORE[resource] || [];
      
      if (ignoreList.length > 0) {
        console.log(`[DELETE] ${resource}: ignoring IDs ${ignoreList.join(', ')}`);
      }
      console.log(`[DELETE] Found ${ids.length} IDs for ${resource}`);

      if (!ids.length) {
        summary.skipped.push({ resource, reason: 'empty' });
        if (onProgress) onProgress({ resource, deleted: 0, total: 0 });
        continue;
      }

      let deletedCount = 0;
      const batchSize = 10;
      // Parallelise les DELETEs par lots de 10 pour accelerer.
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map(id => deleteOne(resource, id))
        );
        
        for (let j = 0; j < results.length; j++) {
          const result = results[j];
          const id = batch[j];
          if (result.status === 'fulfilled') {
            deletedCount += 1;
          } else {
            summary.failed.push({ resource, id, error: result.reason?.message });
            if (stopOnError) throw result.reason;
          }
        }
        
        // Notification de progres apres chaque lot.
        if (onProgress) onProgress({ resource, deleted: deletedCount, total: ids.length });
      }

      summary.deleted.push({ resource, deleted: deletedCount, total: ids.length });
    } catch (error) {
      summary.failed.push({ resource, id: null, error: error.message });
      console.error(`[DELETE] Error processing ${resource}:`, error.message);
      if (stopOnError) throw error;
    }
  }

  return summary;
};

const deleteApi = {
  API_URL,
  DELETE_API_GROUPS,
  FORBIDDEN_DELETE_APIS,
  ALLOWED_DELETE_APIS,
  DELETE_ORDER,
  verifyDeleteOrder,
  runPartialReset,
};

export default deleteApi;
