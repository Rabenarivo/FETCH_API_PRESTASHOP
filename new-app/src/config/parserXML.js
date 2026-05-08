import { XMLParser } from 'fast-xml-parser';

// Liste complète des ressources PrestaShop
const PRESTA_RESOURCES = [
    'address', 'attachment', 'carrier', 'cart_rule', 'cart', 'category',
    'combination', 'configuration', 'contact', 'content_management_system',
    'country', 'currency', 'customer_message', 'customer_thread', 'customer',
    'customization', 'delivery', 'employee', 'group', 'guest', 'image_type',
    'image', 'language', 'manufacturer', 'message', 'order_carrier',
    'order_cart_rule', 'order_detail', 'order_history', 'order_invoice',
    'order_payment', 'order_slip', 'order_state', 'order',
    'price_range', 'product_customization_field', 'product_feature_value',
    'product_feature', 'product_option_value', 'product_option',
    'product_supplier', 'product', 'shop_group', 'shop_url', 'shop',
    'specific_price_rule', 'specific_price', 'stock_available',
    'stock_movement_reason', 'stock_movement', 'stock', 'store', 'supplier',
    'supply_order_detail', 'supply_order_history', 'supply_order_receipt_history',
    'supply_order_state', 'supply_order', 'tag', 'tax_rule_group', 'tax_rule',
    'tax', 'translated_configuration', 'warehouse_product_location',
    'warehouse', 'weight_range', 'zone',
];

// Configuration du parser
const parser = new XMLParser({
    ignoreAttributes: false,        // Garder les attributs (xlink:href, etc.)
    attributeNamePrefix: '',        // Pas de préfixe pour les attributs
    textNodeName: '#text',          // Nom du nœud texte
    cdataPropName: '__cdata',       // Gérer les CDATA si nécessaire
    isArray: (tagName) => PRESTA_RESOURCES.includes(tagName),
    // Option utile pour les valeurs vides
    parseTagValue: true,
    trimValues: true,
});

/**
 * Parse une réponse XML de l'API PrestaShop
 * 
 * @param {string} xmlData - La chaîne XML brute
 * @returns {object} - { prestashop: { product: [...] } }
 * 
 * @example
 * const response = await api.get('products');
 * const data = parsePrestaXML(response.data);
 * const products = data.prestashop.product; // Toujours un tableau !
 */
export const parsePrestaXML = (xmlData) => {
    if (!xmlData || typeof xmlData !== 'string') {
        console.warn('parsePrestaXML: xmlData invalide', xmlData);
        return { prestashop: {} };
    }
    return parser.parse(xmlData);
};

/**
 * Extrait la valeur d'un nœud PrestaShop
 * Gère les cas :
 * - Valeur directe : "texte"
 * - Objet avec #text : { "#text": "valeur" }
 * - Tableau : [ "valeur" ] (cas edge de PrestaShop comme state)
 * - Attributs xlink:href
 * 
 * @param {*} node - Nœud à extraire
 * @param {*} defaultValue - Valeur par défaut si null/undefined
 * @returns {string|number|null}
 * 
 * @example
 * getValue(product.id)           // "1"
 * getValue(product.price)        // "29.99"
 * getValue(product.state)        // "1" (même si tableau [1])
 */
export const getValue = (node, defaultValue = null) => {
    if (node === null || node === undefined) return defaultValue;
    
    // Cas tableau : PrestaShop retourne parfois [valeur]
    if (Array.isArray(node)) {
        return node.length > 0 ? getValue(node[0], defaultValue) : defaultValue;
    }
    
    // Cas objet avec #text (standard PrestaShop)
    if (typeof node === 'object') {
        if ('#text' in node) return node['#text'];
        if ('__cdata' in node) return node['__cdata'];
        // Cas objet vide
        if (Object.keys(node).length === 0) return defaultValue;
    }
    
    // Cas valeur directe (string, number, boolean)
    return node;
};

/**
 * Alias pour getValue (compatibilité)
 */
export const getVal = getValue;

/**
 * Extrait et convertit automatiquement un nombre
 * 
 * @param {*} node 
 * @param {number} defaultValue 
 * @returns {number}
 */
export const getNumber = (node, defaultValue = 0) => {
    const value = getValue(node, defaultValue);
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
};

/**
 * Extrait et convertit un booléen (0/1 → true/false)
 * 
 * @param {*} node 
 * @param {boolean} defaultValue 
 * @returns {boolean}
 */
export const getBoolean = (node, defaultValue = false) => {
    const value = getValue(node);
    if (value === null || value === undefined) return defaultValue;
    return value === '1' || value === 1 || value === 'true';
};

/**
 * Extrait la valeur d'un champ multilingue pour une langue spécifique
 * 
 * Après parse, un champ multilingue ressemble à :
 * {
 *   language: [
 *     { id: "1", "#text": "Pull colibri" },
 *     { id: "2", "#text": "Colibri sweater" }
 *   ]
 * }
 * 
 * @param {object|Array} field - Champ multilingue parsé (ex: product.name)
 * @param {number} langId - ID de la langue (défaut: 1 = français)
 * @returns {string}
 * 
 * @example
 * const productName = getLangValue(product.name, 1); // "Pull colibri"
 */
export const getLangValue = (field, langId = 1) => {
    if (!field) return '';
    
    // Si c'est déjà une string toute simple
    if (typeof field === 'string') return field;
    
    // Récupérer le tableau des langues
    let languages = null;
    if (Array.isArray(field)) {
        languages = field;
    } else if (field?.language) {
        languages = Array.isArray(field.language) ? field.language : [field.language];
    }
    
    if (!languages || !Array.isArray(languages)) return '';
    
    // Chercher la langue demandée
    const found = languages.find(l => Number(l.id) === langId);
    if (found) return getValue(found, '');
    
    // Fallback : première langue non vide
    const firstValid = languages.find(l => getValue(l));
    return firstValid ? getValue(firstValid, '') : '';
};

/**
 * Extrait la liste des éléments d'une collection
 * Utile car avec isArray, on a toujours un tableau, mais parfois vide
 * 
 * @param {object} prestaData - L'objet retourné par parsePrestaXML
 * @param {string} resourceName - Nom de la ressource (ex: 'product')
 * @returns {array} - Tableau des éléments
 * 
 * @example
 * const data = parsePrestaXML(xml);
 * const products = getCollection(data, 'product');
 */
export const getCollection = (prestaData, resourceName) => {
    const collection = prestaData?.prestashop?.[resourceName];
    return Array.isArray(collection) ? collection : [];
};

/**
 * Vérifie si la réponse contient une erreur PrestaShop
 * 
 * @param {object} prestaData 
 * @returns {boolean}
 */
export const hasError = (prestaData) => {
    return prestaData?.prestashop?.errors !== undefined;
};

/**
 * Récupère le message d'erreur si présent
 * 
 * @param {object} prestaData 
 * @returns {string|null}
 */
export const getErrorMessage = (prestaData) => {
    const errors = prestaData?.prestashop?.errors?.error;
    if (!errors) return null;
    
    const errorList = Array.isArray(errors) ? errors : [errors];
    const messages = errorList.map(err => getValue(err.message) || getValue(err.code));
    return messages.join(', ');
};

/**
 * Génère l'URL physique d'une image PrestaShop
 * PrestaShop stocke les images dans un système de dossiers imbriqués :
 * Image ID 123 -> img/p/1/2/3/123.jpg
 * 
 * @param {string|number} imageId - ID de l'image
 * @param {string} type - Type d'image (ex: 'home_default', 'large_default') - Optionnel
 * @returns {string}
 */
export const getPrestaImageUrl = (imageId) => {
    if (!imageId) return null;
    
    const baseUrl = import.meta.env.VITE_PRESTASHOP_URL;
    const idStr = imageId.toString();
    const path = idStr.split('').join('/');
    
    return `${baseUrl}img/p/${path}/${idStr}.jpg`;
};