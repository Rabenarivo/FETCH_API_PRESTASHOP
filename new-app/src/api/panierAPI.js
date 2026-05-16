/**
 * panierAPI.js
 *
 * Gestion des paniers (carts) PrestaShop
 * - Créer/récupérer panier client
 * - Ajouter/modifier/supprimer produits du panier
 * - Afficher le panier
 */

import {
  parsePrestaXML,
  getCollection,
  getValue,
  hasError,
  getErrorMessage,
  getLangValue,
} from '../config/parserXML';

const URL_API =
  process.env.NODE_ENV === 'production'
    ? process.env.REACT_APP_PRESTASHOP_API_URL
    : '/evals/api';

const SHOP_ID_FALLBACK = 1;

const ajouterParamIdShopSiCart = (chemin) => {
  if (!/^carts(\/|\?|$)/.test(chemin)) return chemin;
  if (/[?&]id_shop=/.test(chemin)) return chemin;
  const sep = chemin.includes('?') ? '&' : '?';
  return `${chemin}${sep}id_shop=${SHOP_ID_FALLBACK}`;
};

const requeteApi = async (chemin, options = {}) => {
  const { methode = 'GET', xml = null } = options;
  const init = { method: methode, credentials: 'include', headers: {} };
  const cheminFinal = ajouterParamIdShopSiCart(chemin);

  if (xml !== null) {
    init.headers['Content-Type'] = 'application/xml';
    init.body = xml;
  }

  const reponse = await fetch(`${URL_API}/${cheminFinal}`, init);
  const texte = await reponse.text();
  const donnees = texte ? parsePrestaXML(texte) : null;

  if (!reponse.ok) {
    const messageApi = donnees ? getErrorMessage(donnees) : '';
    throw new Error(`HTTP ${reponse.status} ${methode} /${cheminFinal}${messageApi ? ` - ${messageApi}` : ''}`);
  }

  if (donnees && hasError(donnees)) {
    const messageApi = getErrorMessage(donnees) || 'Erreur API PrestaShop';
    throw new Error(`${methode} /${cheminFinal} - ${messageApi}`);
  }

  return { reponse, texte, donnees };
};

const lireRessourceSimple = (donnees, nom) => {
  const noeud = donnees?.prestashop?.[nom];
  if (Array.isArray(noeud)) return noeud[0] || null;
  return noeud || null;
};

const lireCollectionRessource = (donnees, nom) => {
  const direct = getCollection(donnees, nom);
  if (direct.length) return direct;

  const pluriels = [`${nom}s`, `${nom}es`];
  for (const nomPluriel of pluriels) {
    const conteneur = donnees?.prestashop?.[nomPluriel];
    if (!conteneur) continue;
    if (Array.isArray(conteneur)) return conteneur;
    const contenu = conteneur?.[nom];
    if (Array.isArray(contenu)) return contenu;
    if (contenu) return [contenu];
  }

  return [];
};

const enEntier = (valeur, defaut = 0) => {
  const n = parseInt(valeur, 10);
  return Number.isNaN(n) ? defaut : n;
};

const enNombre = (valeur, defaut = 0) => {
  const normalisee = String(valeur ?? '').replace(',', '.').replace(/\s/g, '');
  const n = parseFloat(normalisee);
  return Number.isNaN(n) ? defaut : n;
};

const enEntierPositif = (valeur, defaut = 1) => {
  const n = enEntier(valeur, defaut);
  return n > 0 ? n : defaut;
};

let cacheTaxRateByIdPromise = null;
const cacheTaxRateByGroupAndAddress = new Map();
let cacheTaxRuleGroupsPromise = null;

const extractPercentFromLabel = (label) => {
  const text = String(label || '');
  const match = text.match(/([0-9]+(?:[.,][0-9]+)?)\s*%/);
  if (!match) return null;
  const percent = Number.parseFloat(match[1].replace(',', '.'));
  return Number.isNaN(percent) ? null : percent;
};

const construireMapTauxTaxeParId = async () => {
  if (!cacheTaxRateByIdPromise) {
    cacheTaxRateByIdPromise = (async () => {
      const { donnees } = await requeteApi('taxes?display=[id,rate]&limit=1000');
      const taxes = lireCollectionRessource(donnees, 'tax');
      const taxRateById = new Map();
      taxes.forEach((tax) => {
        const idTax = enEntier(getValue(tax?.id, 0), 0);
        if (!idTax) return;
        taxRateById.set(idTax, enNombre(getValue(tax?.rate, 0), 0));
      });
      return taxRateById;
    })().catch((error) => {
      cacheTaxRateByIdPromise = null;
      throw error;
    });
  }

  return cacheTaxRateByIdPromise;
};

const construireMapNomGroupeTaxeParId = async () => {
  if (!cacheTaxRuleGroupsPromise) {
    cacheTaxRuleGroupsPromise = (async () => {
      const { donnees } = await requeteApi('tax_rule_groups?display=[id,name]&limit=1000');
      const groups = lireCollectionRessource(donnees, 'tax_rule_group');
      const map = new Map();
      groups.forEach((group) => {
        const idGroup = enEntier(getValue(group?.id, 0), 0);
        if (!idGroup) return;
        map.set(idGroup, String(getValue(group?.name, '') || ''));
      });
      return map;
    })().catch((error) => {
      cacheTaxRuleGroupsPromise = null;
      throw error;
    });
  }

  return cacheTaxRuleGroupsPromise;
};

const lireContexteAdressePanier = async (panier) => {
  const idAddress = enEntier(getValue(panier?.id_address_delivery, 0), 0);
  if (!idAddress) {
    return { idCountry: 0, idState: 0 };
  }

  try {
    const { donnees } = await requeteApi(`addresses/${idAddress}?display=[id_country,id_state]`);
    const address = lireRessourceSimple(donnees, 'address');
    return {
      idCountry: enEntier(getValue(address?.id_country, 0), 0),
      idState: enEntier(getValue(address?.id_state, 0), 0),
    };
  } catch {
    return { idCountry: 0, idState: 0 };
  }
};

const obtenirTauxTaxeSelonAdresse = async ({ idGroupeTaxe, idCountry, idState }) => {
  if (!idGroupeTaxe) return 0;

  const cacheKey = `${idGroupeTaxe}-${idCountry || 0}-${idState || 0}`;
  if (cacheTaxRateByGroupAndAddress.has(cacheKey)) {
    return cacheTaxRateByGroupAndAddress.get(cacheKey);
  }

  try {
    const [taxRateById, taxGroupNames, rulesRes] = await Promise.all([
      construireMapTauxTaxeParId(),
      construireMapNomGroupeTaxeParId().catch(() => new Map()),
      requeteApi(
        `tax_rules?filter[id_tax_rules_group]=[${idGroupeTaxe}]&display=[id_tax,id_country,id_state]&limit=100`
      ),
    ]);

    const rules = lireCollectionRessource(rulesRes.donnees, 'tax_rule');
    let meilleure = null;
    let scoreMeilleur = -1;

    for (const rule of rules) {
      const ruleCountry = enEntier(getValue(rule?.id_country, 0), 0);
      const ruleState = enEntier(getValue(rule?.id_state, 0), 0);

      if (ruleCountry > 0 && idCountry > 0 && ruleCountry !== idCountry) continue;
      if (ruleCountry > 0 && idCountry <= 0) continue;
      if (ruleState > 0 && idState > 0 && ruleState !== idState) continue;
      if (ruleState > 0 && idState <= 0) continue;

      const score = (ruleCountry > 0 ? 2 : 0) + (ruleState > 0 ? 1 : 0);
      if (score > scoreMeilleur) {
        scoreMeilleur = score;
        meilleure = rule;
      }
    }

    let taux = 0;
    if (meilleure) {
      taux = taxRateById.get(enEntier(getValue(meilleure?.id_tax, 0), 0)) || 0;
    } else if (rules.length > 0) {
      // Fallback catalogue: meme comportement que la liste produits.
      taux = taxRateById.get(enEntier(getValue(rules[0]?.id_tax, 0), 0)) || 0;
    }

    if (!taux) {
      const label = taxGroupNames.get(enEntier(idGroupeTaxe, 0)) || '';
      const fromLabel = extractPercentFromLabel(label);
      if (fromLabel !== null) {
        taux = fromLabel;
      }
    }

    cacheTaxRateByGroupAndAddress.set(cacheKey, taux);
    return taux;
  } catch {
    cacheTaxRateByGroupAndAddress.set(cacheKey, 0);
    return 0;
  }
};

const trouverDeclinaisonParDefautProduit = async (idProduit) => {
  if (!idProduit) return 0;

  try {
    const { donnees } = await requeteApi(
      `products/${idProduit}?display=[id,id_default_combination,cache_default_attribute]`
    );
    const produit = lireRessourceSimple(donnees, 'product');
    const idDefaut = enEntier(
      getValue(produit?.id_default_combination || produit?.cache_default_attribute, 0),
      0
    );
    if (idDefaut > 0) return idDefaut;

    const { donnees: donneesCombinaisons } = await requeteApi(
      `combinations?filter[id_product]=[${idProduit}]&display=[id]&sort=[id_ASC]&limit=1`
    );
    const combinaisons = lireCollectionRessource(donneesCombinaisons, 'combination');
    if (combinaisons.length > 0) {
      return enEntier(getValue(combinaisons[0]?.id, 0), 0);
    }

    return 0;
  } catch {
    return 0;
  }
};

const lireGroupeTaxeProduit = async (idProduit) => {
  if (!idProduit) return 0;

  try {
    const { donnees } = await requeteApi(`products/${idProduit}?display=[id,id_tax_rules_group]`);
    const produit = lireRessourceSimple(donnees, 'product');
    return enEntier(getValue(produit?.id_tax_rules_group, 0), 0);
  } catch {
    return 0;
  }
};

const lireTaxRulesDuGroupe = async (idGroupeTaxe) => {
  if (!idGroupeTaxe) return [];

  try {
    const { donnees } = await requeteApi(
      `tax_rules?filter[id_tax_rules_group]=[${idGroupeTaxe}]&display=[id,id_tax,id_country,id_state,behavior]&limit=100`
    );
    return lireCollectionRessource(donnees, 'tax_rule');
  } catch {
    return [];
  }
};

const lireTauxDepuisNomGroupeTaxe = async (idGroupeTaxe) => {
  if (!idGroupeTaxe) return 0;

  try {
    const { donnees } = await requeteApi(`tax_rule_groups/${idGroupeTaxe}?display=[id,name]`);
    const group = lireRessourceSimple(donnees, 'tax_rule_group');
    const fromLabel = extractPercentFromLabel(getValue(group?.name, ''));
    return fromLabel === null ? 0 : fromLabel;
  } catch {
    return 0;
  }
};

const trouverTaxeParTaux = async (taux) => {
  const cible = enNombre(taux, 0);
  if (cible <= 0) return 0;

  try {
    const filtre = encodeURIComponent(String(cible));
    const { donnees } = await requeteApi(`taxes?filter[rate]=[${filtre}]&display=[id,rate]&limit=10`);
    const taxes = lireCollectionRessource(donnees, 'tax');
    const exacte = taxes.find((t) => Math.abs(enNombre(getValue(t?.rate, 0), 0) - cible) < 0.0001);
    if (exacte) return enEntier(getValue(exacte?.id, 0), 0);
  } catch {
    // Fallback below.
  }

  try {
    const { donnees } = await requeteApi('taxes?display=[id,rate]&limit=1000');
    const taxes = lireCollectionRessource(donnees, 'tax');
    const proche = taxes.find((t) => Math.abs(enNombre(getValue(t?.rate, 0), 0) - cible) < 0.0001);
    return proche ? enEntier(getValue(proche?.id, 0), 0) : 0;
  } catch {
    return 0;
  }
};

const creerTaxe = async (taux) => {
  const rate = enNombre(taux, 0);
  if (rate <= 0) return 0;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <tax>
    <rate>${rate.toFixed(6)}</rate>
    <active>1</active>
    <deleted>0</deleted>
    <name>
      <language id="1">Taxe ${rate.toFixed(3)}%</language>
    </name>
  </tax>
</prestashop>`;

  try {
    const { donnees } = await requeteApi('taxes', { methode: 'POST', xml });
    const tax = lireRessourceSimple(donnees, 'tax');
    return enEntier(getValue(tax?.id, 0), 0);
  } catch {
    return 0;
  }
};

const creerTaxRule = async ({ idGroupeTaxe, idTaxe, idCountry, idState = 0 }) => {
  if (!idGroupeTaxe || !idTaxe || !idCountry) return 0;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <tax_rule>
    <id_tax_rules_group>${enEntier(idGroupeTaxe, 0)}</id_tax_rules_group>
    <id_country>${enEntier(idCountry, 0)}</id_country>
    <id_state>${enEntier(idState, 0)}</id_state>
    <zipcode_from>0</zipcode_from>
    <zipcode_to>0</zipcode_to>
    <id_tax>${enEntier(idTaxe, 0)}</id_tax>
    <behavior>0</behavior>
    <description>Auto rule from app</description>
  </tax_rule>
</prestashop>`;

  try {
    const { donnees } = await requeteApi('tax_rules', { methode: 'POST', xml });
    const rule = lireRessourceSimple(donnees, 'tax_rule');
    return enEntier(getValue(rule?.id, 0), 0);
  } catch {
    return 0;
  }
};

const garantirTaxRuleProduit = async ({ idProduit, idCountry }) => {
  const idGroupeTaxe = await lireGroupeTaxeProduit(idProduit);
  if (!idGroupeTaxe || !idCountry) return;

  const rules = await lireTaxRulesDuGroupe(idGroupeTaxe);
  if (rules.length > 0) return;

  const taux = await lireTauxDepuisNomGroupeTaxe(idGroupeTaxe);
  if (taux <= 0) return;

  let idTaxe = await trouverTaxeParTaux(taux);
  if (!idTaxe) {
    idTaxe = await creerTaxe(taux);
  }
  if (!idTaxe) return;

  await creerTaxRule({ idGroupeTaxe, idTaxe, idCountry, idState: 0 });
};

const lirePaysTaxeDepuisGroupe = async (idGroupeTaxe) => {
  if (!idGroupeTaxe) return 0;

  try {
    const { donnees } = await requeteApi(
      `tax_rules?filter[id_tax_rules_group]=[${idGroupeTaxe}]&display=[id_country,id_state]&sort=[id_ASC]&limit=100`
    );
    const rules = lireCollectionRessource(donnees, 'tax_rule');
    if (!rules.length) return 0;

    const regleAvecPays = rules.find((rule) => enEntier(getValue(rule?.id_country, 0), 0) > 0) || rules[0];
    return enEntier(getValue(regleAvecPays?.id_country, 0), 0);
  } catch {
    return 0;
  }
};

const obtenirOuCreerAdresseClientPourPays = async ({ idClient, idCountry, firstname, lastname }) => {
  if (!idClient || !idCountry) return 0;

  try {
    const { donnees } = await requeteApi(
      `addresses?filter[id_customer]=[${idClient}]&filter[id_country]=[${idCountry}]&filter[deleted]=[0]&display=[id]&sort=[id_ASC]&limit=1`
    );
    const addresses = lireCollectionRessource(donnees, 'address');
    if (addresses.length > 0) {
      return enEntier(getValue(addresses[0]?.id, 0), 0);
    }
  } catch {
    // Fallback to create.
  }

  try {
    const prenom = String(firstname || '').trim() || 'Client';
    const nom = String(lastname || '').trim() || 'Client';
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <address>
    <id_customer>${enEntier(idClient, 0)}</id_customer>
    <id_country>${enEntierPositif(idCountry, 1)}</id_country>
    <id_state>0</id_state>
    <alias>Adresse taxe</alias>
    <firstname>${prenom}</firstname>
    <lastname>${nom}</lastname>
    <company></company>
    <address1>Adresse fiscale</address1>
    <address2></address2>
    <postcode>00000</postcode>
    <city>Ville</city>
    <phone></phone>
    <phone_mobile></phone_mobile>
    <active>1</active>
  </address>
</prestashop>`;

    const { donnees } = await requeteApi('addresses', { methode: 'POST', xml });
    const address = lireRessourceSimple(donnees, 'address');
    return enEntier(getValue(address?.id, 0), 0);
  } catch {
    return 0;
  }
};

const obtenirImpactPrixDeclinaison = async (idDeclinaison) => {
  if (!idDeclinaison) return 0;

  try {
    const { donnees } = await requeteApi(`combinations/${idDeclinaison}?display=[id,price]`);
    const combinaison = lireRessourceSimple(donnees, 'combination');
    return enNombre(getValue(combinaison?.price, 0), 0);
  } catch {
    return 0;
  }
};

const lirePremierPaysIdActif = async () => {
  try {
    const { donnees } = await requeteApi('countries?filter[active]=[1]&display=[id]&limit=1');
    const countries = lireCollectionRessource(donnees, 'country');
    if (countries.length > 0) {
      return enEntier(getValue(countries[0]?.id, 0), 0);
    }
  } catch {
    // Ignore lookup failures and use fallback.
  }

  return 8;
};

const creerAdresseClientParDefaut = async ({ idClient, firstname, lastname }) => {
  const idCountry = await lirePremierPaysIdActif();
  const prenom = String(firstname || '').trim() || 'Client';
  const nom = String(lastname || '').trim() || 'Client';

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <address>
    <id_customer>${enEntier(idClient, 0)}</id_customer>
    <id_country>${enEntierPositif(idCountry, 8)}</id_country>
    <id_state>0</id_state>
    <alias>Adresse principale</alias>
    <firstname>${prenom}</firstname>
    <lastname>${nom}</lastname>
    <company></company>
    <address1>Adresse non renseignee</address1>
    <address2></address2>
    <postcode>00000</postcode>
    <city>Ville</city>
    <phone></phone>
    <phone_mobile></phone_mobile>
    <active>1</active>
  </address>
</prestashop>`;

  const { donnees } = await requeteApi('addresses', { methode: 'POST', xml });
  const address = lireRessourceSimple(donnees, 'address');
  return enEntier(getValue(address?.id, 0), 0);
};

// Convertit une liste JS de produits panier vers XML <cart_row>...</cart_row>.
// Helper simple pour garder ajouter/supprimer lisibles.
const construireRowsXml = (lignes, idAddrParDefaut) =>
  lignes
    .map(
      (p) => `
      <cart_row>
        <id_product>${p.id_product}</id_product>
        <id_product_attribute>${p.id_product_attribute}</id_product_attribute>
        <id_address_delivery>${p.id_address_delivery || idAddrParDefaut}</id_address_delivery>
        <id_customization>${p.id_customization || 0}</id_customization>
        <quantity>${p.quantity}</quantity>
      </cart_row>`
    )
    .join('\n');

const construireXmlMiseAJourPanier = ({ cart, idCart, rowsXml, idClient, idAddr, ctx }) => {
  const idShop = enEntierPositif(getValue(cart?.id_shop, ctx?.idShop ?? SHOP_ID_FALLBACK), SHOP_ID_FALLBACK);
  const idShopGroup = enEntierPositif(getValue(cart?.id_shop_group, ctx?.idShopGroup ?? 1), 1);
  const idLang = enEntierPositif(getValue(cart?.id_lang, ctx?.idLang ?? 1), 1);
  const idCurrency = enEntierPositif(getValue(cart?.id_currency, ctx?.idCurrency ?? 1), 1);
  const idAddressDelivery = enEntierPositif(getValue(cart?.id_address_delivery, idAddr), enEntierPositif(idAddr, 1));
  const idAddressInvoice = enEntierPositif(getValue(cart?.id_address_invoice, idAddressDelivery), idAddressDelivery);
  const idGuest = enEntier(getValue(cart?.id_guest, 0), 0);
  const idCarrier = enEntier(getValue(cart?.id_carrier, 0), 0);
  const recyclable = enEntier(getValue(cart?.recyclable, 0), 0);
  const gift = enEntier(getValue(cart?.gift, 0), 0);
  const mobileTheme = enEntier(getValue(cart?.mobile_theme, 0), 0);
  const allowSeparatedPackage = enEntier(getValue(cart?.allow_seperated_package, 0), 0);
  const giftMessage = String(getValue(cart?.gift_message, ''));
  const deliveryOption = String(getValue(cart?.delivery_option, ''));
  const secureKey = String(getValue(cart?.secure_key, ctx?.secureKey || ''));

  return `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <cart>
    <id>${idCart}</id>
    <id_shop_group>${idShopGroup}</id_shop_group>
    <id_shop>${idShop}</id_shop>
    <id_address_delivery>${idAddressDelivery}</id_address_delivery>
    <id_address_invoice>${idAddressInvoice}</id_address_invoice>
    <id_currency>${idCurrency}</id_currency>
    <id_customer>${idClient}</id_customer>
    <id_guest>${idGuest}</id_guest>
    <id_lang>${idLang}</id_lang>
    <id_carrier>${idCarrier}</id_carrier>
    <recyclable>${recyclable}</recyclable>
    <gift>${gift}</gift>
    <gift_message>${giftMessage}</gift_message>
    <mobile_theme>${mobileTheme}</mobile_theme>
    <delivery_option>${deliveryOption}</delivery_option>
    <secure_key>${secureKey}</secure_key>
    <allow_seperated_package>${allowSeparatedPackage}</allow_seperated_package>
    <associations>
      <cart_rows>
${rowsXml}
      </cart_rows>
    </associations>
  </cart>
</prestashop>`;
};

const chargerContexteClientPanier = async (idClient) => {
  const contexte = {
    idAddress: 0,
    idCountry: 0,
    secureKey: '',
    idLang: 1,
    idCurrency: 1,
    idShop: 1,
    idShopGroup: 1,
  };

  if (!idClient) return contexte;

  try {
    const { donnees } = await requeteApi(
      `customers/${idClient}?display=[id,firstname,lastname,secure_key,id_lang,id_shop,id_shop_group]`
    );
    const customer = lireRessourceSimple(donnees, 'customer');
    contexte.secureKey = String(getValue(customer?.secure_key, ''));
    contexte.idLang = enEntier(getValue(customer?.id_lang, 1), 1);
    contexte.idShop = enEntier(getValue(customer?.id_shop, 1), 1);
    contexte.idShopGroup = enEntier(getValue(customer?.id_shop_group, 1), 1);

    contexte.firstname = String(getValue(customer?.firstname, ''));
    contexte.lastname = String(getValue(customer?.lastname, ''));
  } catch {
    // Keep defaults when customer fields are not available.
  }

  try {
    const { donnees } = await requeteApi(
      `addresses?filter[id_customer]=[${idClient}]&filter[deleted]=[0]&display=[id,id_country]&sort=[id_ASC]&limit=1`
    );
    const addresses = lireCollectionRessource(donnees, 'address');
    if (addresses.length > 0) {
      contexte.idAddress = enEntier(getValue(addresses[0]?.id, 0), 0);
      contexte.idCountry = enEntier(getValue(addresses[0]?.id_country, 0), 0);
    }
  } catch {
    // Keep fallback when no usable address is found.
  }

  if (!contexte.idAddress) {
    try {
      const idAddressCreated = await creerAdresseClientParDefaut({
        idClient,
        firstname: contexte.firstname,
        lastname: contexte.lastname,
      });
      contexte.idAddress = enEntier(idAddressCreated, 0);
    } catch {
      // Keep fallback when address creation fails.
    }
  }

  try {
    const { donnees } = await requeteApi('currencies?filter[active]=[1]&display=[id]&limit=1');
    const currencies = lireCollectionRessource(donnees, 'currency');
    if (currencies.length > 0) {
      contexte.idCurrency = enEntier(getValue(currencies[0]?.id, 1), 1);
    }
  } catch {
    // Keep default currency when API lookup fails.
  }

  return contexte;
};

// ────────────────────────────────────────────────────────────
// Panier (Cart)
// ────────────────────────────────────────────────────────────

/**
 * Récupère ou crée le panier active du client
 * @param {number} idClient - ID du client
 * @returns {Promise<object>} - { id, id_customer, date_add, ... }
 */
export async function obtenirOuCreerPanierClient(idClient) {
  if (!idClient) throw new Error('ID client manquant');
  const contexteClient = await chargerContexteClientPanier(idClient);
  const idShop = enEntierPositif(contexteClient.idShop, SHOP_ID_FALLBACK);
  const idShopGroup = enEntierPositif(contexteClient.idShopGroup, 1);
  const idLang = enEntierPositif(contexteClient.idLang, 1);
  const idCurrency = enEntierPositif(contexteClient.idCurrency, 1);

  // Chercher panier actif du client (le plus récent)
  const { donnees } = await requeteApi(
    `carts?filter[id_customer]=[${idClient}]&display=[id,id_customer,id_shop,date_add]&limit=1&sort=[id_DESC]`
  );
  const carts = lireCollectionRessource(donnees, 'cart');

  if (carts.length > 0) {
    const cartId = enEntier(getValue(carts[0]?.id, 0), 0);
    // Verifier que ce panier n'est pas deja converti en commande.
    // Un panier converti retourne 500 sur GET/POST et bloquerait le checkout.
    try {
      const { donnees: checkOrders } = await requeteApi(
        `orders?filter[id_cart]=[${cartId}]&display=[id]&limit=1`
      );
      const ordresExistants = lireCollectionRessource(checkOrders, 'order');
      if (!ordresExistants.length) {
        return {
          id: cartId,
          id_customer: enEntier(getValue(carts[0]?.id_customer, 0), 0),
          id_shop: enEntier(getValue(carts[0]?.id_shop, 1), 1),
          date_add: String(getValue(carts[0]?.date_add, '')),
        };
      }
      // Panier deja converti: on cree un nouveau panier.
    } catch {
      // En cas d'erreur sur la verification, on cree un nouveau panier.
    }
  }

  // Créer nouveau panier
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <cart>
    <id_shop_group>${idShopGroup}</id_shop_group>
    <id_shop>${idShop}</id_shop>
    <id_customer>${idClient}</id_customer>
    <id_lang>${idLang}</id_lang>
    <id_address_delivery>${contexteClient.idAddress}</id_address_delivery>
    <id_address_invoice>${contexteClient.idAddress}</id_address_invoice>
    <id_carrier>0</id_carrier>
    <id_currency>${idCurrency}</id_currency>
    <recyclable>0</recyclable>
    <gift>0</gift>
    <mobile_theme>0</mobile_theme>
    <delivery_option></delivery_option>
    <secure_key>${contexteClient.secureKey}</secure_key>
    <allow_seperated_package>0</allow_seperated_package>
  </cart>
</prestashop>`;

  const resCreation = await requeteApi('carts', { methode: 'POST', xml });
  const cartCreated = lireRessourceSimple(resCreation.donnees, 'cart');
  return {
    id: enEntier(getValue(cartCreated?.id, 0), 0),
    id_customer: idClient,
    id_shop: 1,
    date_add: new Date().toISOString(),
  };
}

/**
 * Récupère les produits du panier
 * @param {number} idCart - ID du panier
 * @returns {Promise<Array>} - Liste { id_product, id_product_attribute, quantity, id_address_delivery, ... }
 */
export async function lireProduitsCart(idCart) {
  if (!idCart) return [];

  const { donnees } = await requeteApi(`carts/${idCart}?display=full`);
  const cart = lireRessourceSimple(donnees, 'cart');

  if (!cart) return [];

  // Les produits du panier sont dans associations.cart_rows
  const cartRows = cart?.associations?.cart_rows?.cart_row;
  if (!cartRows) return [];

  const produits = Array.isArray(cartRows) ? cartRows : [cartRows];
  return produits.map((p) => ({
    id_product: enEntier(getValue(p?.id_product, 0), 0),
    id_product_attribute: enEntier(getValue(p?.id_product_attribute, 0), 0),
    id_customization: enEntier(getValue(p?.id_customization, 0), 0),
    quantity: enEntier(getValue(p?.quantity, 0), 1),
    id_address_delivery: enEntier(getValue(p?.id_address_delivery, 0), 0),
  }));
}

/**
 * Ajoute un produit au panier via PUT sur le panier courant.
 * @param {number} idCart       - ID du panier courant
 * @param {number} idProduit    - ID du produit à ajouter
 * @param {number} idDeclinaison - ID de la déclinaison (0 si aucune)
 * @param {number} quantite     - Quantité à ajouter
 * @param {number} idClientHint - ID client explicite (passé depuis Products.js)
 * @returns {Promise<number>}   - ID du panier mis à jour
 */
export async function ajouterProduitCart(idCart, idProduit, idDeclinaison = 0, quantite = 1, idClientHint = 0) {
  if (!idProduit) throw new Error('Produit manquant');

  let idDeclinaisonFinale = enEntier(idDeclinaison, 0);
  if (!idDeclinaisonFinale) {
    idDeclinaisonFinale = await trouverDeclinaisonParDefautProduit(idProduit);
  }

  // 1. Déterminer l'ID client
  let idClientCart = enEntier(idClientHint, 0);
  if (!idClientCart && idCart) {
    try {
      const { donnees } = await requeteApi(`carts/${idCart}?display=[id,id_customer]`);
      const c = lireRessourceSimple(donnees, 'cart');
      idClientCart = enEntier(getValue(c?.id_customer, 0), 0);
    } catch { /* ignore */ }
  }
  if (!idClientCart) throw new Error('ID client introuvable pour creer le panier');

  // 2. Toujours repartir du dernier panier client (évite de fusionner sur un id obsolète)
  const panierActuel = await obtenirOuCreerPanierClient(idClientCart);
  const idCartSource = enEntierPositif(panierActuel?.id, enEntier(idCart, 0));

  // 3. Charger le contexte client (adresse, devise, langue, secure_key)
  const ctx = await chargerContexteClientPanier(idClientCart);
  const { donnees: donneesPanier } = await requeteApi(`carts/${idCartSource}?display=full`);
  const cart = lireRessourceSimple(donneesPanier, 'cart');
  if (!cart) throw new Error(`Panier ${idCartSource} introuvable`);

  let idAddr = enEntierPositif(getValue(cart?.id_address_delivery, ctx.idAddress), enEntierPositif(ctx.idAddress, 1));

  // Forcer une adresse de panier compatible avec la regle de taxe du produit
  // afin que le total calcule cote site/BO soit TTC (pas HT uniquement).
  const idGroupeTaxeProduit = await lireGroupeTaxeProduit(idProduit);
  let idPaysTaxe = await lirePaysTaxeDepuisGroupe(idGroupeTaxeProduit);
  if (!idPaysTaxe) {
    idPaysTaxe = enEntierPositif(ctx.idCountry || 0, 0);
  }

  if (idPaysTaxe > 0) {
    await garantirTaxRuleProduit({ idProduit, idCountry: idPaysTaxe });
  }

  // Relecture apres auto-reparation d'eventuelles tax_rules manquantes.
  if (!idPaysTaxe) {
    idPaysTaxe = await lirePaysTaxeDepuisGroupe(idGroupeTaxeProduit);
  }
  if (idPaysTaxe > 0) {
    const idAddrTaxe = await obtenirOuCreerAdresseClientPourPays({
      idClient: idClientCart,
      idCountry: idPaysTaxe,
      firstname: ctx.firstname,
      lastname: ctx.lastname,
    });
    if (idAddrTaxe > 0) {
      idAddr = idAddrTaxe;
    }
  }

  // 4. Charger les lignes actuelles du panier source
  const existants = idCartSource ? await lireProduitsCart(idCartSource) : [];

  // 5) Fusionner les lignes existantes avec le nouveau produit
  // Si le produit existe deja -> on additionne la quantite.
  // Sinon -> on ajoute une nouvelle ligne.
  const existant = existants.find(
    (p) => p.id_product === idProduit && p.id_product_attribute === idDeclinaisonFinale
  );

  let cartRows;
  if (existant) {
    cartRows = existants.map((p) =>
      p.id_product === idProduit && p.id_product_attribute === idDeclinaisonFinale
        ? { ...p, quantity: p.quantity + quantite, id_address_delivery: p.id_address_delivery || idAddr }
        : { ...p, id_address_delivery: p.id_address_delivery || idAddr }
    );
  } else {
    cartRows = [
      ...existants.map((p) => ({ ...p, id_address_delivery: p.id_address_delivery || idAddr })),
      {
        id_product: idProduit,
        id_product_attribute: idDeclinaisonFinale,
        id_customization: 0,
        quantity: quantite,
        id_address_delivery: idAddr,
      },
    ];
  }

  // 6) Transformer les lignes en XML, puis faire un PUT du panier.
  const rowsXml = construireRowsXml(cartRows, idAddr);

  const xml = construireXmlMiseAJourPanier({
    cart,
    idCart: idCartSource,
    rowsXml,
    idClient: idClientCart,
    idAddr,
    ctx,
  });

  await requeteApi(`carts/${idCartSource}`, { methode: 'PUT', xml });
  return idCartSource;
}

/**
 * Supprime un produit du panier.
 * - S'il ne reste plus de lignes: DELETE panier
 * - Sinon: PUT du panier avec les lignes restantes
 * @param {number} idCart - ID du panier courant
 * @param {number} idProduit - ID du produit à supprimer
 * @param {number} idDeclinaison - ID de la déclinaison (0 si aucune)
 * @returns {Promise<number|null>} - ID du panier mis à jour ou null si supprimé
 */
export async function supprimerProduitCart(idCart, idProduit, idDeclinaison = 0) {
  if (!idCart || !idProduit) throw new Error('Cart ou produit manquant');

  // Charger le client depuis le panier
  const { donnees: donneesPanier } = await requeteApi(`carts/${idCart}?display=[id,id_customer]`);
  const cartInfo = lireRessourceSimple(donneesPanier, 'cart');
  const idClientCart = enEntier(getValue(cartInfo?.id_customer, 0), 0);
  if (!idClientCart) throw new Error('ID client introuvable pour recreer le panier');

  // Contexte client + panier complet
  const ctx = await chargerContexteClientPanier(idClientCart);
  const { donnees: donneesPanierComplet } = await requeteApi(`carts/${idCart}?display=full`);
  const cart = lireRessourceSimple(donneesPanierComplet, 'cart');
  if (!cart) throw new Error(`Panier ${idCart} introuvable`);

  const idAddr = enEntierPositif(getValue(cart?.id_address_delivery, ctx.idAddress), enEntierPositif(ctx.idAddress, 1));

  // Produits restants apres suppression de la ligne cible
  const produits = await lireProduitsCart(idCart);
  const remaining = produits.filter(
    (p) => !(p.id_product === idProduit && p.id_product_attribute === idDeclinaison)
  );

  if (remaining.length === 0) {
    await requeteApi(`carts/${idCart}`, { methode: 'DELETE' });
    return null;
  }

  // Sinon on met a jour le panier avec les lignes restantes
  const rowsXml = construireRowsXml(remaining, idAddr);

  const xml = construireXmlMiseAJourPanier({
    cart,
    idCart,
    rowsXml,
    idClient: idClientCart,
    idAddr,
    ctx,
  });

  await requeteApi(`carts/${idCart}`, { methode: 'PUT', xml });
  return idCart;
}

/**
 * Récupère le contenu complet du panier avec détails produits
 * @param {number} idCart - ID du panier
 * @returns {Promise<object>} - { panier: { id, ... }, produits: [ { id_product, name, prix_ttc, quantity, total, ... } ] }
 */
export async function afficherPanierComplet(idCart) {
  if (!idCart) throw new Error('ID panier manquant');

  const { donnees: donneesPanier } = await requeteApi(`carts/${idCart}?display=full`);
  const panier = lireRessourceSimple(donneesPanier, 'cart');

  if (!panier) throw new Error(`Panier ${idCart} introuvable`);

  const produitsCart = await lireProduitsCart(idCart);
  const { idCountry, idState } = await lireContexteAdressePanier(panier);

  // Enrichir avec détails produits
  const produits = [];
  let totalPanierHt = 0;
  let totalPanierTtc = 0;

  for (const item of produitsCart) {
    const { donnees: donneesProd } = await requeteApi(
      `products/${item.id_product}?display=[id,name,price,id_tax_rules_group,id_default_combination]`
    );
    const produit = lireRessourceSimple(donneesProd, 'product');

    if (produit) {
      const prixBaseHt = enNombre(getValue(produit?.price, 0), 0);
      const impactDeclinaisonHt = await obtenirImpactPrixDeclinaison(item.id_product_attribute);
      const prixUnitaireHt = prixBaseHt + impactDeclinaisonHt;
      const idGroupeTaxe = enEntier(getValue(produit?.id_tax_rules_group, 0), 0);
      const tauxTaxe = await obtenirTauxTaxeSelonAdresse({
        idGroupeTaxe,
        idCountry,
        idState,
      });
      const prixUnitaireTtc = prixUnitaireHt * (1 + tauxTaxe / 100);

      const totalHt = prixUnitaireHt * item.quantity;
      const totalTtc = prixUnitaireTtc * item.quantity;
      totalPanierHt += totalHt;
      totalPanierTtc += totalTtc;

      produits.push({
        id_product: item.id_product,
        id_product_attribute: item.id_product_attribute,
        name: String(getLangValue(produit?.name, 1) || getValue(produit?.name, '')),
        prix_unitaire_ttc: prixUnitaireTtc,
        quantity: item.quantity,
        total_ht: totalHt,
        total_ttc: totalTtc,
      });
    }
  }

  return {
    panier: {
      id: enEntier(getValue(panier?.id, 0), 0),
      id_customer: enEntier(getValue(panier?.id_customer, 0), 0),
      id_shop: enEntier(getValue(panier?.id_shop, 1), 1),
      date_add: String(getValue(panier?.date_add, '')),
    },
    produits,
    totalHt: Number(totalPanierHt.toFixed(2)),
    totalTtc: Number(totalPanierTtc.toFixed(2)),
    quantiteTotale: produits.reduce((acc, p) => acc + p.quantity, 0),
  };
}

/**
 * Vide le panier en le supprimant.
 * @param {number} idCart - ID du panier courant
 * @returns {Promise<void>}
 */
export async function viderPanier(idCart) {
  if (!idCart) throw new Error('ID panier manquant');

  await requeteApi(`carts/${idCart}`, { methode: 'DELETE' });
}

/**
 * Supprime le panier complètement
 * @param {number} idCart - ID du panier
 * @returns {Promise<void>}
 */
export async function supprimerPanier(idCart) {
  if (!idCart) throw new Error('ID panier manquant');

  await requeteApi(`carts/${idCart}`, { methode: 'DELETE' });
}
