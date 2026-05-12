import {
  parsePrestaXML,
  getCollection,
  getErrorMessage,
  getValue,
  getLangValue,
  hasError,
} from '../config/parserXML';

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

const lireCollectionAssociee = (noeud, nomAssociation, nomEntite) => {
  const source = noeud?.associations?.[nomAssociation]?.[nomEntite];
  return asArray(source);
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

const requeteApi = async (chemin, options = {}) => {
  const { methode = 'GET', xml = null } = options;
  const init = { method: methode, credentials: 'include', headers: {} };

  if (xml !== null) {
    init.headers['Content-Type'] = 'application/xml';
    init.body = xml;
  }

  const reponse = await fetch(`${URL_API}/${chemin}`, init);
  const texte = await reponse.text();
  const donnees = texte ? parsePrestaXML(texte) : null;

  if (!reponse.ok) {
    const messageApi = donnees ? getErrorMessage(donnees) : '';
    throw new Error(`HTTP ${reponse.status} ${methode} /${chemin}${messageApi ? ` - ${messageApi}` : ''}`);
  }

  if (donnees && hasError(donnees)) {
    const messageApi = getErrorMessage(donnees) || 'Erreur API PrestaShop';
    throw new Error(`${methode} /${chemin} - ${messageApi}`);
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
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <address>
    <id_customer>${idClient}</id_customer>
    <id_country>${idPays}</id_country>
    <id_state>0</id_state>
    <alias>${nettoyerTexte(`Adresse ${nom || idClient}`)}</alias>
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
  const { donnees } = await requeteApi(`combinations/${idCombinaison}`);
  return lireRessourceSimple(donnees, 'combination');
};

const lireValeurAttribut = async (idValeur) => {
  const { donnees } = await requeteApi(`product_option_values/${idValeur}`);
  return lireRessourceSimple(donnees, 'product_option_value');
};

const trouverCombinaisonPourProduit = async (produit, variante, config) => {
  if (!produit) return 0;
  if (!variante) {
    return produit.idDefaultCombination || 0;
  }

  const variantTarget = normaliserTexte(variante);
  const productDetail = produit.donneesDetail ? lireRessourceSimple(produit.donneesDetail, 'product') : null;
  const association = productDetail?.associations?.combinations?.combination;
  const combinaisonIds = asArray(association)
    .map((item) => enEntier(getValue(item?.id, 0), 0))
    .filter(Boolean);

  for (const idCombinaison of combinaisonIds) {
    const combination = await lireCombinaison(idCombinaison);
    const valuesAssoc = combination?.associations?.product_option_values?.product_option_value;
    const valueIds = asArray(valuesAssoc)
      .map((item) => enEntier(getValue(item?.id, 0), 0))
      .filter(Boolean);

    for (const idValeur of valueIds) {
      const valeur = await lireValeurAttribut(idValeur);
      const nomValeur = normaliserTexte(getLangValue(valeur?.name, config.idLangue) || getValue(valeur?.name, ''));
      if (nomValeur === variantTarget) {
        return idCombinaison;
      }
    }
  }

  return produit.idDefaultCombination || 0;
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

  const tests = [];
  if (/accepte|accept|paiement accepte/.test(cible)) {
    tests.push(/paiement accepte|payment accepted|payment accept|ws payment/);
  }
  if (/attente.*livraison|livraison/.test(cible)) {
    tests.push(/livraison|delivery|cash on delivery|en attente/);
  }
  if (/erreur|failed|refuse/.test(cible)) {
    tests.push(/erreur|error|payment error|canceled|cancelled/);
  }

  for (const state of states) {
    const nom = normaliserTexte(getLangValue(state?.name, config.idLangue) || getValue(state?.name, ''));
    if (tests.some((regexp) => regexp.test(nom))) {
      return enEntier(getValue(state?.id, 0), 0);
    }
  }

  return 0;
};

const trouverPremiereCurrencyId = async (config) => {
  const { donnees } = await requeteApi('currencies?filter[active]=[1]&display=[id]&limit=1');
  const liste = lireCollectionRessource(donnees, 'currency');
  if (!liste.length) return enEntier(config.idCurrency, 1);
  return enEntier(getValue(liste[0]?.id, config.idCurrency), enEntier(config.idCurrency, 1));
};

const creerCartApi = async (idClient, idAdresse, achats, config) => {
  const idCurrency = await trouverPremiereCurrencyId(config);
  const rowsXml = achats
    .map(
      (item) => `
        <cart_row>
          <id_product>${item.idProduit}</id_product>
          <id_product_attribute>${item.idCombination}</id_product_attribute>
          <id_address_delivery>${idAdresse}</id_address_delivery>
          <quantity>${item.quantity}</quantity>
        </cart_row>`
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
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
    <secure_key></secure_key>
    <allow_seperated_package>0</allow_seperated_package>
    <delivery_option></delivery_option>
    <associations>
      <cart_rows>
        ${rowsXml}
      </cart_rows>
    </associations>
  </cart>
</prestashop>`;

  const { donnees } = await requeteApi('carts', { methode: 'POST', xml });
  const cart = lireRessourceSimple(donnees, 'cart');
  const idCart = enEntier(getValue(cart?.id, 0), 0);
  if (!idCart) throw new Error('Impossible de recuperer id_cart apres creation');
  return idCart;
};

const creerCommandeApi = async (idCart, idClient, idAdresse, idCarrier, etat, total, config) => {
  const idCurrency = await trouverPremiereCurrencyId(config);
  const payment = String(etat || 'Import fichier 3').trim() || 'Import fichier 3';
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
    <current_state>0</current_state>
    <payment>${nettoyerTexte(payment)}</payment>
    <module>${nettoyerTexte(config.modulePaiement)}</module>
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
    <total_paid_real>${total.toFixed(6)}</total_paid_real>
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

const creerHistoriqueCommande = async (idOrder, idState) => {
  if (!idState) return null;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order_history>
    <id_order>${idOrder}</id_order>
    <id_order_state>${idState}</id_order_state>
    <id_employee>0</id_employee>
  </order_history>
</prestashop>`;

  const { donnees } = await requeteApi('order_histories', { methode: 'POST', xml });
  const history = lireRessourceSimple(donnees, 'order_history');
  return enEntier(getValue(history?.id, 0), 0);
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
    let prixHt = produit.prixHt;
    if (combinaisonId) {
      const combinaison = await lireCombinaison(combinaisonId);
      prixHt += enNombre(getValue(combinaison?.price, 0), 0);
    }

    const tauxTaxe = await obtenirTauxTaxeDepuisGroupe(produit.idGroupeTaxe);
    const prixTtc = prixHt * (1 + tauxTaxe / 100);
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

      // 8) Calcul des totaux commande + resolution produit/combinaison.
      const { totalTtc } = await calculerTotalCommande(achats, config);
      const idCarrier = cache.carriers || (cache.carriers = await trouverPremierCarrierId());
      if (!idCarrier) {
        throw new Error('Aucun transporteur actif trouve');
      }

      const cartItems = achats.map((item) => ({
        idProduit: item.idProduit,
        idCombination: item.idCombination,
        quantity: item.quantity,
      }));

      // 9) Creation panier puis commande.
      const idCart = await creerCartApi(idClient, idAdresse, cartItems, config);
      const idOrder = await creerCommandeApi(
        idCart,
        idClient,
        idAdresse,
        idCarrier,
        ligne.etat,
        totalTtc,
        config
      );

      // 10) Appliquer l'etat commande si resolu.
      if (!cache.etats) {
        cache.etats = new Map();
      }

      let idEtat = cache.etats.get(ligne.etat);
      if (idEtat === undefined) {
        idEtat = await trouverEtatCommande(ligne.etat, config);
        cache.etats.set(ligne.etat, idEtat || 0);
      }
      if (idEtat) {
        try {
          await creerHistoriqueCommande(idOrder, idEtat);
        } catch (erreurEtat) {
          warnings.push(`Ligne ${done}: commande creee mais statut non applique (${erreurEtat.message})`);
        }
      } else {
        warnings.push(`Ligne ${done}: statut "${ligne.etat}" non resolu, commande creee sans changement d'etat`);
      }

      success += 1;
      notifier(`Ligne ${done}/${total}: commande creee pour ${ligne.email}`);
    } catch (erreur) {
      erreurs.push(`Ligne ${done}: ${erreur.message}`);
      ignored += 1;
      warnings.push(`Ligne ${done}: ${erreur.message}`);
      notifier(`Ligne ${done}/${total}: ignoree`);
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
