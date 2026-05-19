/**
 * importFichier3API.js
 *
 * Import du fichier 3 (clients/commandes/paniers selon le mapping configure).
 */

import {
  parsePrestaXML,
  getCollection,
  getErrorMessage,
  getValue,
  getLangValue,
  hasError,
} from '../config/parserXML';
import {
  validerColonnesObligatoires,
  validerDateDdMmYyyy,
  validerMontantPositif,
} from './exceptionAPI';

const URL_API =
  process.env.NODE_ENV === 'production'
    ? process.env.REACT_APP_PRESTASHOP_API_URL
    : '/evals/api';

export const CONFIG_FICHIER3 = {
  idLangue: 1,
  idBoutique: 1,
  idShopGroup: 1,
  idPaysDefaut: 8,
  idCurrency: 1,
  modulePaiement: 'ps_wirepayment',
  separateur: 'auto',
  lignesAIgnorer: 1,
};

export const TABLES_FICHIER3 = [
  'customers',
  'addresses',
  'products',
  'combinations',
  'product_option_values',
  'stock_availables',
  'carts',
  'orders',
  'order_histories',
  'order_states',
  'order_carriers',
  'carrier',
];

const ORDER_STATE_NAMES_FICHIER3 = [
  { aliases: ['en attente du paiement par cheque'], prestaName: 'En attente du paiement par chèque' },
  { aliases: ['paiement accepte'], prestaName: 'Paiement accepté' },
  { aliases: ['en cours de preparation'], prestaName: 'En cours de préparation' },
  { aliases: ['expedie'], prestaName: 'Expédié' },
  { aliases: ['livre'], prestaName: 'Livré' },
  { aliases: ['annule'], prestaName: 'Annulé' },
  { aliases: ['rembourse'], prestaName: 'Remboursé' },
  { aliases: ['erreur de paiement'], prestaName: 'Erreur de paiement' },
  { aliases: ['en attente de reapprovisionnement paye'], prestaName: 'En attente de réapprovisionnement (payé)' },
  { aliases: ['en attente de virement bancaire'], prestaName: 'En attente de virement bancaire' },
  { aliases: ['paiement a distance accepte'], prestaName: 'Paiement à distance accepté' },
  { aliases: ['en attente de reapprovisionnement non paye'], prestaName: 'En attente de réapprovisionnement (non payé)' },
  {
    aliases: ['en attente paiement a la livraison', 'en attente de paiement a la livraison'],
    prestaName: 'En attente de paiement à la livraison',
  },
  { aliases: ['en attente de paiement'], prestaName: 'En attente de paiement' },
  { aliases: ['remboursement partiel'], prestaName: 'Remboursement partiel' },
  { aliases: ['paiement partiel'], prestaName: 'Paiement partiel' },
  { aliases: ['autorisation a capturer par le marchand'], prestaName: 'Autorisation. A capturer par le marchand' },
];

const nettoyerTexte = (texte = '') =>
  String(texte)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const normaliserTexte = (texte = '') =>
  String(texte)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const enEntier = (valeur, defaut = 0) => {
  const n = parseInt(valeur, 10);
  return Number.isNaN(n) ? defaut : n;
};

const enNombre = (valeur, defaut = 0) => {
  const normalisee = String(valeur ?? '').replace(',', '.').replace(/\s/g, '');
  const n = parseFloat(normalisee);
  return Number.isNaN(n) ? defaut : n;
};

const asArray = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
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

const detecterSeparateur = (contenu) => {
  const premiereLigne = String(contenu || '').replace(/^\uFEFF/, '').split(/\r?\n/)[0] || '';
  const nbVirgules = (premiereLigne.match(/,/g) || []).length;
  const nbPointVirgules = (premiereLigne.match(/;/g) || []).length;
  if (nbVirgules >= nbPointVirgules) {
    return ',';
  }
  return ';';
};

const parserCsvSimple = (contenu, separateur = ',') => {
  const lignes = String(contenu || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((ligne) => ligne.trim())
    .filter(Boolean);

  if (!lignes.length) return { headers: [], rows: [] };

  const parseLine = (ligne) => {
    const cellules = [];
    let current = '';
    let insideQuotes = false;

    for (let i = 0; i < ligne.length; i += 1) {
      const char = ligne[i];
      const next = ligne[i + 1];

      if (char === '"' && next === '"' && insideQuotes) {
        current += '"';
        i += 1;
        continue;
      }

      if (char === '"') {
        insideQuotes = !insideQuotes;
        continue;
      }

      if (char === separateur && !insideQuotes) {
        cellules.push(current.trim());
        current = '';
        continue;
      }

      current += char;
    }

    cellules.push(current.trim());
    return cellules;
  };

  return {
    headers: parseLine(lignes[0]),
    rows: lignes.slice(1).map(parseLine),
  };
};

const extraireAchat = (valeur) => {
  const source = String(valeur || '').trim();
  if (!source || source === '[]') return [];

  const items = [];

  const contenu = source
    .replace(/^\s*\[\s*/, '')
    .replace(/\s*\]\s*$/, '')
    .trim();

  const blocs = contenu.match(/\((?:[^()(]|\([^()]*\))*\)/g) || [];

  for (const bloc of blocs) {
    const brut = bloc.replace(/^\(\s*/, '').replace(/\s*\)$/, '').trim();
    const morceaux = brut.split(/\s*;\s*/);
    if (morceaux.length < 3) continue;

    const reference = String(morceaux[0] || '')
      .replace(/^"+/, '')
      .replace(/"+$/, '')
      .replace(/""/g, '"')
      .trim();
    const quantity = enEntier(morceaux[1], 1);
    const variante = String(morceaux.slice(2).join(';') || '')
      .replace(/^"+/, '')
      .replace(/"+$/, '')
      .replace(/""/g, '"')
      .trim();

    if (!reference) continue;

    items.push({
      reference,
      quantity,
      variante,
    });
  }

  return items;
};

// Comme panierAPI.js : ajouter id_shop=1 a toutes les URLs carts (listing et operations)
// PrestaShop exige ce parametre pour les requetes sur la ressource carts
const ajouterIdShopSiCart = (chemin) => {
  if (!/^carts(\/|\?|$)/.test(chemin)) return chemin;
  if (/[?&]id_shop=/.test(chemin)) return chemin;
  const sep = chemin.includes('?') ? '&' : '?';
  return `${chemin}${sep}id_shop=1`;
};

const requeteApi = async (chemin, options = {}) => {
  const { methode = 'GET', xml = null } = options;
  const init = { method: methode, credentials: 'include', headers: {} };
  const cheminFinal = ajouterIdShopSiCart(chemin);

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

const lirePaysId = async (isoCode, config) => {
  if (!isoCode) return enEntier(config.idPaysDefaut, 8);
  if (/^\d+$/.test(String(isoCode))) return enEntier(isoCode, config.idPaysDefaut);

  const filtre = encodeURIComponent(String(isoCode).toUpperCase());
  const { donnees } = await requeteApi(`countries?filter[iso_code]=[${filtre}]&display=[id]`);
  const liste = lireCollectionRessource(donnees, 'country');
  if (!liste.length) return enEntier(config.idPaysDefaut, 8);
  return enEntier(getValue(liste[0]?.id, config.idPaysDefaut), config.idPaysDefaut);
};

const trouverClientParEmail = async (email) => {
  if (!email) return null;
  const filtre = encodeURIComponent(String(email).trim());
  const { donnees } = await requeteApi(`customers?filter[email]=[${filtre}]&display=[id]`);
  const liste = lireCollectionRessource(donnees, 'customer');
  if (!liste.length) return null;
  return enEntier(getValue(liste[0]?.id, 0), 0);
};

const creerClientApi = async (ligne, config) => {
  const nom = String(ligne.nom || '').trim();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <customer>
    <id_shop_group>${enEntier(config.idShopGroup, 1)}</id_shop_group>
    <id_shop>${enEntier(config.idBoutique, 1)}</id_shop>
    <id_gender>0</id_gender>
    <id_default_group>3</id_default_group>
    <firstname>${nettoyerTexte(nom)}</firstname>
    <lastname>${nettoyerTexte(nom)}</lastname>
    <email>${nettoyerTexte(ligne.email || '')}</email>
    <passwd>${nettoyerTexte(ligne.pwd || 'MotDePasse123!')}</passwd>
    <birthday>0000-00-00</birthday>
    <newsletter>0</newsletter>
    <optin>0</optin>
    <active>1</active>
    <company></company>
    <siret></siret>
    <ape></ape>
  </customer>
</prestashop>`;

  const { donnees } = await requeteApi('customers', { methode: 'POST', xml });
  const client = lireRessourceSimple(donnees, 'customer');
  const idClient = enEntier(getValue(client?.id, 0), 0);
  if (!idClient) throw new Error('Impossible de recuperer id_customer apres creation');
  return idClient;
};

const creerAdresseClient = async (idClient, ligne, config) => {
  const adresse = String(ligne.adresse || '').trim();
  if (!adresse) return null;

  const idPays = await lirePaysId(config.paysIsoDefaut || config.addr_country_iso || 'FR', config);
  const nom = String(ligne.nom || '').trim();
  const alias = nettoyerTexte(`Adresse ${nom || idClient}`);

  // Chercher une adresse existante avec le meme alias pour ce client (import idempotent)
  try {
    const filtreAlias = encodeURIComponent(alias);
    const { donnees: donneesExist } = await requeteApi(
      `addresses?filter[id_customer]=[${idClient}]&filter[alias]=[${filtreAlias}]&display=[id]&limit=1`
    );
    const listeExist = lireCollectionRessource(donneesExist, 'address');
    const idExist = enEntier(getValue(listeExist[0]?.id, 0), 0);
    if (idExist) return idExist;
  } catch (_) {
    // Recherche impossible, on cree quand meme
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <address>
    <id_customer>${idClient}</id_customer>
    <id_country>${idPays}</id_country>
    <id_state>0</id_state>
    <alias>${alias}</alias>
    <firstname>${nettoyerTexte(nom)}</firstname>
    <lastname>${nettoyerTexte(nom)}</lastname>
    <company></company>
    <address1>${nettoyerTexte(adresse)}</address1>
    <address2></address2>
    <postcode>00000</postcode>
    <city>${nettoyerTexte(adresse)}</city>
    <phone></phone>
    <phone_mobile></phone_mobile>
    <active>1</active>
  </address>
</prestashop>`;

  const { donnees } = await requeteApi('addresses', { methode: 'POST', xml });
  const address = lireRessourceSimple(donnees, 'address');
  return enEntier(getValue(address?.id, 0), 0);
};

const trouverProduitParReference = async (reference) => {
  if (!reference) return null;

  const filtre = encodeURIComponent(String(reference).trim());
  const { donnees } = await requeteApi(`products?filter[reference]=[${filtre}]&display=[id]`);
  const liste = lireCollectionRessource(donnees, 'product');
  if (!liste.length) return null;

  const idProduit = enEntier(getValue(liste[0]?.id, 0), 0);
  if (!idProduit) return null;

  const { donnees: donneesDetail } = await requeteApi(
    `products/${idProduit}?display=[id,reference,price,id_tax_rules_group,id_default_combination,cache_default_attribute]`
  );
  const produit = lireRessourceSimple(donneesDetail, 'product');
  if (!produit) return null;

  return {
    id: enEntier(getValue(produit?.id, 0), 0),
    reference: String(getValue(produit?.reference, '') || '').trim(),
    prixHt: enNombre(getValue(produit?.price, 0), 0),
    idGroupeTaxe: enEntier(getValue(produit?.id_tax_rules_group, 0), 0),
    idDefaultCombination: enEntier(
      getValue(produit?.id_default_combination || produit?.cache_default_attribute, 0),
      0
    ),
    donneesDetail,
  };
};

const obtenirTauxTaxeDepuisGroupe = async (idGroupeTaxe) => {
  if (!idGroupeTaxe) return 0;

  const { donnees: donneesRegles } = await requeteApi(
    `tax_rules?filter[id_tax_rules_group]=[${idGroupeTaxe}]&display=[id_tax]&limit=1`
  );
  const regles = lireCollectionRessource(donneesRegles, 'tax_rule');
  if (!regles.length) return 0;

  const idTaxe = enEntier(getValue(regles[0]?.id_tax, 0), 0);
  if (!idTaxe) return 0;

  const { donnees: donneesRate } = await requeteApi(`taxes/${idTaxe}?display=[id,rate]`);
  const taxe = lireRessourceSimple(donneesRate, 'tax');
  return enNombre(getValue(taxe?.rate, 0), 0);
};

const lireCombinaison = async (idCombinaison) => {
  const { donnees } = await requeteApi(`combinations/${idCombinaison}?display=full`);
  return lireRessourceSimple(donnees, 'combination');
};

const lireValeurAttribut = async (idValeur) => {
  const { donnees } = await requeteApi(`product_option_values/${idValeur}?display=full`);
  return lireRessourceSimple(donnees, 'product_option_value');
};

const listerCombinaisonsProduit = async (idProduit) => {
  if (!idProduit) return [];

  const { donnees } = await requeteApi(
    `combinations?filter[id_product]=[${idProduit}]&display=full&limit=200`
  );

  return lireCollectionRessource(donnees, 'combination');
};

const trouverCombinaisonPourProduit = async (produit, variante, config) => {
  if (!produit) return 0;
  if (!variante) {
    return produit.idDefaultCombination || 0;
  }

  const variantTarget = normaliserTexte(variante);
  // Recuperer toutes les combinaisons avec leurs associations en une seule requete
  const combinations = await listerCombinaisonsProduit(produit.id);

  console.log(`[debug] trouverCombinaison produit=${produit.id} variante="${variante}" cible="${variantTarget}" nbCombinations=${combinations.length}`);

  for (const combination of combinations) {
    const idCombinaison = enEntier(getValue(combination?.id, 0), 0);
    if (!idCombinaison) continue;

    const valuesAssoc = combination?.associations?.product_option_values?.product_option_value;
    const valueIds = asArray(valuesAssoc)
      .map((item) => enEntier(getValue(item?.id, 0), 0))
      .filter(Boolean);

    console.log(`[debug]   combination id=${idCombinaison} valuesAssoc=`, valuesAssoc, 'valueIds=', valueIds);

    for (const idValeur of valueIds) {
      const valeur = await lireValeurAttribut(idValeur);
      const nomBrut = getLangValue(valeur?.name, config.idLangue) || getValue(valeur?.name, '');
      const nomValeur = normaliserTexte(nomBrut);
      console.log(`[debug]     idValeur=${idValeur} nomBrut="${nomBrut}" nomNormalise="${nomValeur}" == cible? ${nomValeur === variantTarget}`);
      if (nomValeur === variantTarget) {
        return idCombinaison;
      }
    }
  }

  console.warn(`[debug] aucune combinaison trouvee pour variante="${variante}" (cible="${variantTarget}")`);
  return 0;
};

const trouverPremierCarrierId = async () => {
  const { donnees } = await requeteApi('carriers?filter[active]=[1]&display=[id]&limit=1');
  const liste = lireCollectionRessource(donnees, 'carrier');
  if (!liste.length) return 0;
  return enEntier(getValue(liste[0]?.id, 0), 0);
};

const trouverEtatCommande = async (etat, config) => {
  const cible = normaliserTexte(etat);
  const { donnees } = await requeteApi('order_states?display=[id,name]&limit=100');
  const states = lireCollectionRessource(donnees, 'order_state');

  const definitionEtat = ORDER_STATE_NAMES_FICHIER3.find((item) =>
    item.aliases.some((alias) => normaliserTexte(alias) === cible)
  );

  if (definitionEtat) {
    const correspondanceTableau = states.find((state) => {
      const nom = getLangValue(state?.name, config.idLangue) || getValue(state?.name, '');
      return normaliserTexte(nom) === normaliserTexte(definitionEtat.prestaName);
    });

    if (correspondanceTableau) {
      return enEntier(getValue(correspondanceTableau?.id, 0), 0);
    }
  }

  const correspondanceExacte = states.find((state) => {
    const nom = normaliserTexte(getLangValue(state?.name, config.idLangue) || getValue(state?.name, ''));
    return nom === cible;
  });
  if (correspondanceExacte) {
    return enEntier(getValue(correspondanceExacte?.id, 0), 0);
  }

  return 0;
};

const trouverPremiereCurrencyId = async (config) => {
  const { donnees } = await requeteApi('currencies?filter[active]=[1]&display=[id]&limit=1');
  const liste = lireCollectionRessource(donnees, 'currency');
  if (!liste.length) return enEntier(config.idCurrency, 1);
  return enEntier(getValue(liste[0]?.id, config.idCurrency), enEntier(config.idCurrency, 1));
};

const lireSecureKeyClient = async (idClient) => {
  try {
    const { donnees } = await requeteApi(`customers/${idClient}?display=[id,secure_key]`);
    const client = lireRessourceSimple(donnees, 'customer');
    return String(getValue(client?.secure_key, '') || '');
  } catch (_) {
    return '';
  }
};

const trouverCartNonCommandeClient = async (idClient) => {
  let carts = [];
  try {
    const { donnees } = await requeteApi(
      `carts?filter[id_customer]=[${idClient}]&display=[id]&sort=[id_DESC]&limit=10`
    );
    carts = lireCollectionRessource(donnees, 'cart');
    console.log(`[debug] trouverCartNonCommandeClient client=${idClient} => ${carts.length} panier(s) trouve(s)`);
  } catch (errCarts) {
    console.warn(`[debug] trouverCartNonCommandeClient echec lecture carts: ${errCarts?.message}`);
    return 0;
  }

  for (const cart of carts) {
    const idCart = enEntier(getValue(cart?.id, 0), 0);
    if (!idCart) continue;
    try {
      const { donnees: checkOrders } = await requeteApi(
        `orders?filter[id_cart]=[${idCart}]&display=[id]&limit=1`
      );
      const ordres = lireCollectionRessource(checkOrders, 'order');
      console.log(`[debug]   cart=${idCart} commandes=${ordres.length}`);
      if (!ordres.length) {
        console.log(`[debug]   => panier non commande, reutilisation cart=${idCart}`);
        return idCart;
      }
    } catch (errOrdre) {
      console.warn(`[debug]   cart=${idCart} erreur check commande: ${errOrdre?.message} - on ignore ce panier`);
      // Ignorer ce panier et continuer l'iteration
    }
  }
  console.log(`[debug] trouverCartNonCommandeClient aucun panier non commande pour client=${idClient}`);
  return 0;
};

const creerCartApi = async (idClient, idAdresse, achats, config) => {
  const idCurrency = await trouverPremiereCurrencyId(config);
  // Recuperer le secure_key du client pour eviter les echecs PUT avec secure_key vide
  const secureKeyClient = await lireSecureKeyClient(idClient);

  // 1) Creer un nouveau panier en incluant le secure_key du client
  const xmlCart = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <cart>
    <id_shop_group>${enEntier(config.idShopGroup, 1)}</id_shop_group>
    <id_shop>${enEntier(config.idBoutique, 1)}</id_shop>
    <id_address_delivery>${idAdresse}</id_address_delivery>
    <id_address_invoice>${idAdresse}</id_address_invoice>
    <id_currency>${idCurrency}</id_currency>
    <id_customer>${idClient}</id_customer>
    <id_lang>${enEntier(config.idLangue, 1)}</id_lang>
    <id_carrier>0</id_carrier>
    <recyclable>0</recyclable>
    <gift>0</gift>
    <mobile_theme>0</mobile_theme>
    <secure_key>${secureKeyClient}</secure_key>
    <allow_seperated_package>0</allow_seperated_package>
    <delivery_option></delivery_option>
  </cart>
</prestashop>`;

  // 2) Construire les lignes produits
  const rowsXml = achats
    .map(
      (item) => `
        <cart_row>
          <id_product>${item.idProduit}</id_product>
          <id_product_attribute>${item.idCombination}</id_product_attribute>
          <id_address_delivery>${idAdresse}</id_address_delivery>
          <id_customization>0</id_customization>
          <quantity>${item.quantity}</quantity>
        </cart_row>`
    )
    .join('\n');

  // Inclure les produits directement dans le POST (evite un GET+PUT supplementaire)
  const xmlCartAvecProduits = xmlCart.replace(
    '</cart>',
    `  <associations>
      <cart_rows nodeType="cart_row" api="cart_rows">
        ${rowsXml}
      </cart_rows>
    </associations>
  </cart>`
  );

  const { donnees: donneesPanier } = await requeteApi('carts', { methode: 'POST', xml: xmlCartAvecProduits });
  const cartCreated = lireRessourceSimple(donneesPanier, 'cart');
  const idCart = enEntier(getValue(cartCreated?.id, 0), 0);
  if (!idCart) throw new Error('Impossible de recuperer id_cart apres creation');

  // 3) Verifier que les produits ont bien ete enregistres dans le panier
  //    Si le POST n'a pas inclus les cart_rows, faire un PUT
  try {
    const { donnees: donneesFull } = await requeteApi(`carts/${idCart}?display=full`);
    const cartFull = lireRessourceSimple(donneesFull, 'cart');
    const rowsExistants = cartFull?.associations?.cart_rows?.cart_row;
    const nbRows = Array.isArray(rowsExistants)
      ? rowsExistants.length
      : rowsExistants
      ? 1
      : 0;

    if (nbRows === 0) {
      // Le POST n'a pas enregistre les produits, on fait un PUT
      console.log(`[debug] cart=${idCart} POST sans produits, tentative PUT`);
      // Utiliser secure_key du cart OU celui du client comme fallback
      const secureKey = String(getValue(cartFull?.secure_key, secureKeyClient) || secureKeyClient || '');
      const idGuest = enEntier(getValue(cartFull?.id_guest, 0), 0);
      const idCarrierCart = enEntier(getValue(cartFull?.id_carrier, 0), 0);
      const deliveryOption = String(getValue(cartFull?.delivery_option, '') || '');
      const xmlUpdate = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <cart>
    <id>${idCart}</id>
    <id_shop_group>${enEntier(getValue(cartFull?.id_shop_group, config.idShopGroup), 1)}</id_shop_group>
    <id_shop>${enEntier(getValue(cartFull?.id_shop, config.idBoutique), 1)}</id_shop>
    <id_address_delivery>${idAdresse}</id_address_delivery>
    <id_address_invoice>${idAdresse}</id_address_invoice>
    <id_currency>${idCurrency}</id_currency>
    <id_customer>${idClient}</id_customer>
    <id_guest>${idGuest}</id_guest>
    <id_lang>${enEntier(getValue(cartFull?.id_lang, config.idLangue), 1)}</id_lang>
    <id_carrier>${idCarrierCart}</id_carrier>
    <recyclable>0</recyclable>
    <gift>0</gift>
    <gift_message></gift_message>
    <mobile_theme>0</mobile_theme>
    <delivery_option>${deliveryOption}</delivery_option>
    <secure_key>${secureKey}</secure_key>
    <allow_seperated_package>0</allow_seperated_package>
    <associations>
      <cart_rows nodeType="cart_row" api="cart_rows">
        ${rowsXml}
      </cart_rows>
    </associations>
  </cart>
</prestashop>`;
      await requeteApi(`carts/${idCart}`, { methode: 'PUT', xml: xmlUpdate });
      console.log(`[debug] cart=${idCart} PUT OK`);
    } else {
      console.log(`[debug] cart=${idCart} POST avec produits OK (${nbRows} ligne(s))`);
    }
  } catch (errMaj) {
    console.error(`[debug] cart=${idCart} erreur mise a jour produits:`, errMaj?.message);
    throw errMaj;
  }

  return idCart;
};

const creerCommandeApi = async (
  idCart,
  idClient,
  idAdresse,
  idCarrier,
  etat,
  total,
  config,
  idEtat = 0,
  doitAvoirPaiement = false
) => {
  const idCurrency = await trouverPremiereCurrencyId(config);
  // PrestaShop Webservice exige un champ payment non vide a la creation de commande.
  const payment = String(config.libellePaiement || 'Import fichier 3').trim() || 'Import fichier 3';
  const modulePaiement = String(config.modulePaiement || 'ps_wirepayment').trim() || 'ps_wirepayment';
  const totalPaidReal = doitAvoirPaiement ? total : 0;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order>
    <id_address_delivery>${idAdresse}</id_address_delivery>
    <id_address_invoice>${idAdresse}</id_address_invoice>
    <id_cart>${idCart}</id_cart>
    <id_currency>${idCurrency}</id_currency>
    <id_lang>${enEntier(config.idLangue, 1)}</id_lang>
    <id_customer>${idClient}</id_customer>
    <id_carrier>${idCarrier}</id_carrier>
    <current_state>${enEntier(idEtat, 0)}</current_state>
    <payment>${nettoyerTexte(payment)}</payment>
    <module>${nettoyerTexte(modulePaiement)}</module>
    <recyclable>0</recyclable>
    <gift>0</gift>
    <gift_message></gift_message>
    <mobile_theme>0</mobile_theme>
    <total_discounts>0</total_discounts>
    <total_discounts_tax_incl>0</total_discounts_tax_incl>
    <total_discounts_tax_excl>0</total_discounts_tax_excl>
    <total_paid>${total.toFixed(6)}</total_paid>
    <total_paid_tax_incl>${total.toFixed(6)}</total_paid_tax_incl>
    <total_paid_tax_excl>${total.toFixed(6)}</total_paid_tax_excl>
    <total_paid_real>${totalPaidReal.toFixed(6)}</total_paid_real>
    <total_products>${total.toFixed(6)}</total_products>
    <total_products_wt>${total.toFixed(6)}</total_products_wt>
    <total_shipping>0</total_shipping>
    <total_shipping_tax_incl>0</total_shipping_tax_incl>
    <total_shipping_tax_excl>0</total_shipping_tax_excl>
    <carrier_tax_rate>0</carrier_tax_rate>
    <total_wrapping>0</total_wrapping>
    <total_wrapping_tax_incl>0</total_wrapping_tax_incl>
    <total_wrapping_tax_excl>0</total_wrapping_tax_excl>
    <conversion_rate>1</conversion_rate>
    <invoice_number>0</invoice_number>
    <delivery_number>0</delivery_number>
    <invoice_date>0000-00-00 00:00:00</invoice_date>
    <delivery_date>0000-00-00 00:00:00</delivery_date>
    <valid>0</valid>
  </order>
</prestashop>`;

  const { donnees } = await requeteApi('orders', { methode: 'POST', xml });
  const order = lireRessourceSimple(donnees, 'order');
  const idOrder = enEntier(getValue(order?.id, 0), 0);
  if (!idOrder) throw new Error('Impossible de recuperer id_order apres creation');
  return idOrder;
};

const forcerEtatCommande = async (idOrder, idState) => {
  if (!idOrder || !idState) return;

  const { texte } = await requeteApi(`orders/${idOrder}?display=full`);
  let xmlOrder = String(texte || '');
  xmlOrder = xmlOrder.replace(
    /<current_state>([^<]*)<\/current_state>/,
    `<current_state>${enEntier(idState, 0)}</current_state>`
  );
  xmlOrder = xmlOrder.replace(/ xlink:href="[^"]*"/g, '');

  await requeteApi(`orders/${idOrder}`, { methode: 'PUT', xml: xmlOrder });
};

const creerHistoriqueCommande = async (idOrder, idState) => {
  if (!idOrder || !idState) return 0;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order_history>
    <id_order>${idOrder}</id_order>
    <id_order_state>${idState}</id_order_state>
    <id_employee>0</id_employee>
  </order_history>
</prestashop>`;

  const { donnees } = await requeteApi('order_histories', { methode: 'POST', xml });
  const historique = lireRessourceSimple(donnees, 'order_history');
  return enEntier(getValue(historique?.id, 0), 0);
};

const listerHistoriquesCommande = async (idOrder) => {
  if (!idOrder) return [];

  const { donnees } = await requeteApi(
    `order_histories?filter[id_order]=[${idOrder}]&display=[id,id_order_state]&sort=[id_ASC]&limit=50`
  );

  return lireCollectionRessource(donnees, 'order_history')
    .map((history) => ({
      id: enEntier(getValue(history?.id, 0), 0),
      idOrderState: enEntier(getValue(history?.id_order_state, 0), 0),
    }))
    .filter((history) => history.id > 0);
};

const supprimerHistoriqueCommande = async (idHistorique) => {
  if (!idHistorique) return;
  await requeteApi(`order_histories/${idHistorique}`, { methode: 'DELETE' });
};

// ────────────────────────────────────────────────────────────
// Paiement (ps_order_payment)
// ────────────────────────────────────────────────────────────

const obtenirReferenceCommande = async (idOrder) => {
  const { donnees } = await requeteApi(`orders/${idOrder}?display=[id,reference]`);
  const order = lireRessourceSimple(donnees, 'order');
  return String(getValue(order?.reference, '') || '').trim();
};

const creerPaiementCommande = async (referenceCommande, montant, config, dateCommande) => {
  if (!referenceCommande) throw new Error('Reference commande manquante pour le paiement');

  const idCurrency = await trouverPremiereCurrencyId(config);
  const methodePaiement = String(config.libellePaiement || 'Import fichier 3').trim();

  // Normaliser la date au format PrestaShop yyyy-mm-dd hh:mm:ss
  let dateAdd = '0000-00-00 00:00:00';
  if (dateCommande) {
    const parsed = new Date(
      String(dateCommande).replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$3-$2-$1')
    );
    if (!isNaN(parsed.getTime())) {
      dateAdd = parsed.toISOString().replace('T', ' ').slice(0, 19);
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order_payment>
    <order_reference>${nettoyerTexte(referenceCommande)}</order_reference>
    <id_currency>${idCurrency}</id_currency>
    <amount>${montant.toFixed(6)}</amount>
    <payment_method>${nettoyerTexte(methodePaiement)}</payment_method>
    <conversion_rate>1.000000</conversion_rate>
    <transaction_id></transaction_id>
    <card_number></card_number>
    <card_brand></card_brand>
    <card_expiration></card_expiration>
    <card_holder></card_holder>
    <date_add>${dateAdd}</date_add>
  </order_payment>
</prestashop>`;

  const { donnees } = await requeteApi('order_payments', { methode: 'POST', xml });
  const paiement = lireRessourceSimple(donnees, 'order_payment');
  return enEntier(getValue(paiement?.id, 0), 0);
};

const listerPaiementsParReference = async (referenceCommande) => {
  if (!referenceCommande) return [];
  const filtre = encodeURIComponent(referenceCommande);
  const { donnees } = await requeteApi(
    `order_payments?filter[order_reference]=[${filtre}]&display=[id]&limit=100`
  );

  return lireCollectionRessource(donnees, 'order_payment')
    .map((item) => enEntier(getValue(item?.id, 0), 0))
    .filter(Boolean);
};

const supprimerPaiementCommande = async (idOrderPayment) => {
  if (!idOrderPayment) return;
  await requeteApi(`order_payments/${idOrderPayment}`, { methode: 'DELETE' });
};

const synchroniserPaiementCommande = async ({
  referenceCommande,
  totalTtc,
  config,
  dateCommande,
  doitAvoirPaiement,
}) => {
  if (!referenceCommande) return;

  const paiementsExistants = await listerPaiementsParReference(referenceCommande);

  if (doitAvoirPaiement) {
    // Eviter les doublons: on ne cree qu'en absence de paiement existant.
    if (!paiementsExistants.length) {
      await creerPaiementCommande(referenceCommande, totalTtc, config, dateCommande);
    }
    return;
  }

  // Regle stricte demandee: pour les autres etats, aucun paiement ne doit rester.
  for (const idOrderPayment of paiementsExistants) {
    await supprimerPaiementCommande(idOrderPayment);
  }
};

const nettoyerHistoriquesCommande = async (idOrder, idEtat) => {
  if (!idOrder || !idEtat) return;

  const historiques = await listerHistoriquesCommande(idOrder);
  if (!historiques.length) return;

  const historiquesEtat = historiques.filter((history) => history.idOrderState === idEtat);
  const historiqueConserve = historiquesEtat.length
    ? historiquesEtat[historiquesEtat.length - 1]
    : historiques[historiques.length - 1];

  for (const history of historiques) {
    if (history.id === historiqueConserve.id) continue;
    await supprimerHistoriqueCommande(history.id);
  }
};

export const lireApercuCsvFichier3 = (file, separateur = 'auto') =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const contenu = String(event.target.result || '').replace(/^\uFEFF/, '');
      const sep = separateur === 'auto' ? detecterSeparateur(contenu) : separateur;
      const parsed = parserCsvSimple(contenu, sep);
      resolve({ headers: parsed.headers, rows: parsed.rows, separateur: sep });
    };
    reader.onerror = reject;
    reader.readAsText(file, 'utf-8');
  });

export const detecterMappingFichier3 = (headers) =>
  headers.map((header) => {
    const h = normaliserTexte(header);
    if (h === 'date') return 'date';
    if (h === 'nom') return 'nom';
    if (h === 'email') return 'email';
    if (h === 'pwd' || h === 'password' || h === 'passwd') return 'pwd';
    if (h === 'adresse') return 'adresse';
    if (h === 'achat') return 'achat';
    if (h === 'etat') return 'etat';
    return '';
  });

const construireLigne = (entetes, ligne, mapping) => {
  const objet = {};
  entetes.forEach((_, index) => {
    const champ = mapping[index];
    if (!champ) return;
    objet[champ] = (ligne[index] || '').trim();
  });
  return objet;
};

const calculerTotalCommande = async (achats, config) => {
  // Flux: pour chaque item d'achat, on resolve produit + combinaison puis on calcule HT/TTC.
  let totalHt = 0;
  let totalTtc = 0;

  for (const item of achats) {
    const produit = await trouverProduitParReference(item.reference);
    if (!produit) {
      throw new Error(`produit "${item.reference}" introuvable`);
    }

    const combinaisonId = await trouverCombinaisonPourProduit(produit, item.variante, config);
    if (item.variante && !combinaisonId) {
      throw new Error(`variante "${item.variante}" introuvable pour la reference "${item.reference}"`);
    }
    let prixHt = produit.prixHt;
    let prixTtc = 0;
    const tauxTaxe = await obtenirTauxTaxeDepuisGroupe(produit.idGroupeTaxe);
    const prixTtcBase = prixHt * (1 + tauxTaxe / 100);

    if (combinaisonId) {
      const combinaison = await lireCombinaison(combinaisonId);
      const prixCombinaison = enNombre(getValue(combinaison?.price, 0), 0);

      // PrestaShop stocke parfois le prix de vente du karazany comme un prix direct,
      // parfois comme un impact sur le prix de base. On privilégie le prix direct
      // quand la valeur stockée ressemble déjà à un prix de vente TTC.
      if (prixCombinaison > 0 && prixCombinaison >= prixHt) {
        prixTtc = prixCombinaison;
        prixHt = tauxTaxe > 0 ? prixTtc / (1 + tauxTaxe / 100) : prixTtc;
      } else {
        prixHt += prixCombinaison;
        prixTtc = prixHt * (1 + tauxTaxe / 100);
      }
    } else {
      prixTtc = prixTtcBase;
    }

    if (!combinaisonId) {
      prixHt = tauxTaxe > 0 ? prixTtc / (1 + tauxTaxe / 100) : prixTtc;
    }

    totalHt += prixHt * item.quantity;
    totalTtc += prixTtc * item.quantity;

    item.idProduit = produit.id;
    item.idCombination = combinaisonId || 0;
    item.prixHt = prixHt;
    item.prixTtc = prixTtc;
    item.idGroupeTaxe = produit.idGroupeTaxe;
  }

  return { totalHt, totalTtc };
};

export const importerFichier3AvecApi = async (file, mapping, onProgress, options = {}) => {
  // 1) Charger le CSV + fusionner la configuration runtime.
  const config = { ...CONFIG_FICHIER3, ...options };
  const { headers, rows, separateur } = await lireApercuCsvFichier3(file, config.separateur, 0);

  validerColonnesObligatoires({
    mapping,
    requiredFields: ['date', 'nom', 'email', 'pwd', 'adresse', 'achat', 'etat'],
    labelByField: {
      date: 'date',
      nom: 'nom',
      email: 'email',
      pwd: 'pwd',
      adresse: 'adresse',
      achat: 'achat',
      etat: 'etat',
    },
    fichier: 'fichier3',
  });

  console.log('[fichier3] CSV parse', {
    separateurDetecte: separateur,
    totalHeaders: headers.length,
    totalLignes: rows.length,
  });
  console.log('[fichier3] tables utilisees', TABLES_FICHIER3);

  // 2) Retirer les lignes d'en-tete deja gerees par le mapping.
  const extra = Math.max(0, enEntier(config.lignesAIgnorer, 1) - 1);
  const lignes = rows.slice(extra);
  const total = lignes.length;

  let done = 0;
  let success = 0;
  let ignored = 0;
  const erreurs = [];
  const warnings = [];

  const notifier = (status) => {
    const percent = total > 0 ? Math.round((done / total) * 100) : 100;
    if (typeof onProgress === 'function') onProgress({ done, total, percent, status });
  };

  const cache = {
    // Cache simple pour eviter de recharger les memes infos a chaque ligne.
    clients: new Map(),
    carriers: null,
    etats: null,
  };

  for (const cellules of lignes) {
    // 3) Construire la ligne metier depuis le mapping CSV.
    done += 1;
    const ligne = construireLigne(headers, cellules, mapping);

    try {
      // 4) Validation minimale.
      if (!ligne.email) throw new Error('Email manquant');
      if (!ligne.nom) throw new Error('Nom manquant');
      if (!ligne.achat) throw new Error('Achat manquant');
      validerDateDdMmYyyy(ligne.date, { champ: 'date', ligne: done, obligatoire: true });

      notifier(`Ligne ${done}/${total}: traitement ${ligne.email}`);

      // 5) Client: rechercher par email, sinon creer.
      let idClient = cache.clients.get(ligne.email);
      if (!idClient) {
        idClient = await trouverClientParEmail(ligne.email);
      }
      if (!idClient) {
        idClient = await creerClientApi(ligne, config);
      }
      cache.clients.set(ligne.email, idClient);

      // 6) Adresse de livraison/facturation.
      let idAdresse = await creerAdresseClient(idClient, ligne, config);
      if (!idAdresse) {
        // Fallback: si aucune adresse exploitable, on réutilise l'adresse du client la plus récente n'est pas disponible ici.
        throw new Error(`adresse manquante pour ${ligne.email}`);
      }

      // 7) Parser la colonne achat et preparer les lignes produit.
      const achats = extraireAchat(ligne.achat);
      if (!achats.length) {
        throw new Error('Aucun achat exploitable dans la colonne achat');
      }
      for (const item of achats) {
        validerMontantPositif(item.quantity, {
          champ: `quantite (${item.reference || 'achat'})`,
          ligne: done,
          obligatoire: true,
        });
      }

      // 8) Calcul des totaux commande + resolution produit/combinaison.
      const { totalTtc } = await calculerTotalCommande(achats, config);
      validerMontantPositif(totalTtc, { champ: 'total_commande', ligne: done, obligatoire: true });
      const idCarrier = cache.carriers || (cache.carriers = await trouverPremierCarrierId());
      if (!idCarrier) {
        throw new Error('Aucun transporteur actif trouve');
      }

      // Si etat est vide => creer seulement le panier
      const etatVide = String(ligne.etat || '').trim() === '';

      const cartItems = achats.map((item) => ({
        idProduit: item.idProduit,
        idCombination: item.idCombination,
        quantity: item.quantity,
      }));

      // 9) Creation panier
      //    Pour etat vide: reutiliser un cart non commande existant si possible
      let idCart;
      if (etatVide) {
        const idCartExistant = await trouverCartNonCommandeClient(idClient);
        if (idCartExistant) {
          console.log(`[debug] etatVide: reutilisation cart existant ${idCartExistant} pour client ${idClient}`);
          // Mettre a jour le cart existant avec les produits actuels
          const secureKeyClient = await lireSecureKeyClient(idClient);
          const idCurrency = await trouverPremiereCurrencyId(config);
          const rowsXml = cartItems
            .map(
              (item) => `
        <cart_row>
          <id_product>${item.idProduit}</id_product>
          <id_product_attribute>${item.idCombination}</id_product_attribute>
          <id_address_delivery>${idAdresse}</id_address_delivery>
          <id_customization>0</id_customization>
          <quantity>${item.quantity}</quantity>
        </cart_row>`
            )
            .join('\n');
          const { donnees: donneesExist } = await requeteApi(`carts/${idCartExistant}?display=full`);
          const cartExist = lireRessourceSimple(donneesExist, 'cart');
          const secureKey = String(getValue(cartExist?.secure_key, secureKeyClient) || secureKeyClient || '');
          const idGuest = enEntier(getValue(cartExist?.id_guest, 0), 0);
          const idCarrierCart = enEntier(getValue(cartExist?.id_carrier, 0), 0);
          const deliveryOption = String(getValue(cartExist?.delivery_option, '') || '');
          const xmlUpdate = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <cart>
    <id>${idCartExistant}</id>
    <id_shop_group>${enEntier(getValue(cartExist?.id_shop_group, config.idShopGroup), 1)}</id_shop_group>
    <id_shop>${enEntier(getValue(cartExist?.id_shop, config.idBoutique), 1)}</id_shop>
    <id_address_delivery>${idAdresse}</id_address_delivery>
    <id_address_invoice>${idAdresse}</id_address_invoice>
    <id_currency>${idCurrency}</id_currency>
    <id_customer>${idClient}</id_customer>
    <id_guest>${idGuest}</id_guest>
    <id_lang>${enEntier(getValue(cartExist?.id_lang, config.idLangue), 1)}</id_lang>
    <id_carrier>${idCarrierCart}</id_carrier>
    <recyclable>0</recyclable>
    <gift>0</gift>
    <gift_message></gift_message>
    <mobile_theme>0</mobile_theme>
    <delivery_option>${deliveryOption}</delivery_option>
    <secure_key>${secureKey}</secure_key>
    <allow_seperated_package>0</allow_seperated_package>
    <associations>
      <cart_rows nodeType="cart_row" api="cart_rows">
        ${rowsXml}
      </cart_rows>
    </associations>
  </cart>
</prestashop>`;
          await requeteApi(`carts/${idCartExistant}`, { methode: 'PUT', xml: xmlUpdate });
          idCart = idCartExistant;
        } else {
          idCart = await creerCartApi(idClient, idAdresse, cartItems, config);
        }
      } else {
        idCart = await creerCartApi(idClient, idAdresse, cartItems, config);
      }

      if (!etatVide) {
        // Cas: statut present => creer aussi la commande
        if (!cache.etats) {
          cache.etats = new Map();
        }

        let idEtat = cache.etats.get(ligne.etat);
        if (idEtat === undefined) {
          idEtat = await trouverEtatCommande(ligne.etat, config);
          cache.etats.set(ligne.etat, idEtat || 0);
        }
        if (!idEtat) {
          throw new Error(`statut "${ligne.etat}" introuvable dans les etats de commande`);
        }

        const etatNormaliseLigne = normaliserTexte(ligne.etat || '');
        const estStatutPaiementCsv =
          etatNormaliseLigne === normaliserTexte('paiement accepte')
          || etatNormaliseLigne === normaliserTexte('paiement a distance accepte');

        const idOrder = await creerCommandeApi(
          idCart,
          idClient,
          idAdresse,
          idCarrier,
          ligne.etat,
          totalTtc,
          config,
          idEtat,
          estStatutPaiementCsv
        );

        // Nettoyer le panier d'import: evite qu'obtenirOuCreerPanierClient
        // le recupere lors du prochain achat client (panier deja converti => 500).
        try {
          await requeteApi(`carts/${idCart}`, { methode: 'DELETE' });
        } catch (_) {
          // Ignoré: la commande est créée, le panier deviendra orphelin au pire.
        }

        // PrestaShop peut ignorer current_state lors du POST.
        // On applique l'etat via order_history (methode officielle qui declenche
        // les hooks et met a jour current_state) puis on force en PUT par securite.
        const idHistoriqueEtat = await creerHistoriqueCommande(idOrder, idEtat);
        if (!idHistoriqueEtat) {
          throw new Error(`statut "${ligne.etat}" non applique a la commande ${idOrder}`);
        }

        // Forcer current_state directement via PUT pour garantir la coherence.
        await forcerEtatCommande(idOrder, idEtat);

        try {
          await nettoyerHistoriquesCommande(idOrder, idEtat);
        } catch (erreurHistorique) {
          warnings.push(`Ligne ${done}: commande creee mais nettoyage des statuts impossible (${erreurHistorique.message})`);
        }

        // 10) Paiement: synchroniser ps_order_payment selon le statut.
        //     - paiements autorises: conserver/creer
        //     - autres statuts: supprimer toute entree existante
        try {
          const referenceCommande = await obtenirReferenceCommande(idOrder);
          await synchroniserPaiementCommande({
            referenceCommande,
            totalTtc,
            config,
            dateCommande: ligne.date,
            doitAvoirPaiement: estStatutPaiementCsv,
          });
        } catch (erreurPaiement) {
          warnings.push(`Ligne ${done}: commande creee mais synchronisation paiement impossible (${erreurPaiement.message})`);
        }

        success += 1;
        notifier(`Ligne ${done}/${total}: commande creee pour ${ligne.email}`);
      } else {
        // Etat vide => panier seulement, succès
        success += 1;
        notifier(`Ligne ${done}/${total}: panier cree pour ${ligne.email}`);
      }
    } catch (erreur) {
      erreurs.push(`Ligne ${done}: ${erreur.message}`);
      ignored += 1;
      notifier(`Ligne ${done}/${total}: ERREUR - ${String(erreur.message || '').substring(0, 120)}`);
    }
  }

  if (erreurs.length) {
    console.error('[fichier3] import termine avec erreurs', {
      erreurs,
      warnings,
      successCount: success,
      ignoredCount: ignored,
      doneCount: done,
    });
    throw Object.assign(new Error('Import termine avec erreurs'), {
      details: [...erreurs, ...warnings],
    });
  }

  notifier('Import termine');
  return {
    doneCount: done,
    totalCount: total,
    successCount: success,
    ignoredCount: ignored,
    warnings,
  };
};
