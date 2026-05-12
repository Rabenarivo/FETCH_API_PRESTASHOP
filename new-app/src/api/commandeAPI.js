import {
  parsePrestaXML,
  getCollection,
  getValue,
  getLangValue,
  getNumber,
  hasError,
  getErrorMessage,
} from '../config/parserXML';

const URLS_API =
  process.env.NODE_ENV === 'production'
    ? [process.env.REACT_APP_PRESTASHOP_API_URL, '/evals/api']
    : [process.env.REACT_APP_PRESTASHOP_API_URL_DEV, '/evals/api', 'http://localhost/evals/api'];

const BASES_API = URLS_API.filter(Boolean);

async function requeteApi(chemin, options = {}) {
  let derniereErreur = null;

  for (const base of BASES_API) {
    try {
      const reponse = await fetch(`${base}/${chemin}`, {
        credentials: 'include',
        ...options,
        headers: { 'Content-Type': 'application/xml', ...(options.headers || {}) },
      });
      const texte = await reponse.text();
      const donnees = parsePrestaXML(texte);

      if (!reponse.ok) {
        const messageApi = hasError(donnees) ? getErrorMessage(donnees) : '';
        throw new Error(`HTTP ${reponse.status} /${chemin}${messageApi ? ` - ${messageApi}` : ''}`);
      }

      if (hasError(donnees)) {
        throw new Error(getErrorMessage(donnees) || `Erreur API sur /${chemin}`);
      }

      return { reponse, texte, donnees };
    } catch (erreur) {
      derniereErreur = erreur;
      // En dev, si le proxy local est indisponible, on tente la base suivante.
      const estErreurReseau =
        erreur instanceof TypeError || /Failed to fetch|ERR_CONNECTION_REFUSED/i.test(String(erreur?.message || ''));
      if (!estErreurReseau) throw erreur;
    }
  }

  throw new Error(derniereErreur?.message || `Erreur réseau sur /${chemin}`);
}

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

// ────────────────────────────────────────────────────────────
// États de commande
// ────────────────────────────────────────────────────────────

/**
 * Retourne la liste de tous les états de commande PrestaShop.
 * @returns {Promise<Array<{id: string, nom: string}>>}
 */
export async function listerEtatsCommande() {
  const { donnees } = await requeteApi('order_states?display=full&id_lang=1');
  return lireCollectionRessource(donnees, 'order_state').map((e) => ({
    id: String(getValue(e.id, '')),
    nom: getLangValue(e.name, 1) || String(getValue(e.name, '')),
  }));
}

// ────────────────────────────────────────────────────────────
// Commandes
// ────────────────────────────────────────────────────────────

/**
 * Charge les commandes enrichies avec nom client, pays livraison, état libellé.
 * @returns {Promise<Array>}
 */
export async function listerCommandes() {
  // display=full obligatoire : avec display=[champs], les brackets dans l'URL
  // ne sont pas encodés par fetch et PrestaShop peut retourner une liste vide.
  const [resOrders, resCustomers, resAddresses, resCountries, resStates] = await Promise.all([
    requeteApi('orders?display=full'),
    requeteApi('customers?display=full'),
    requeteApi('addresses?display=full'),
    requeteApi('countries?display=full&id_lang=1'),
    requeteApi('order_states?display=full&id_lang=1'),
  ]);

  // Construire maps
  const clientMap = {};
  lireCollectionRessource(resCustomers.donnees, 'customer').forEach((c) => {
    const id = String(getValue(c.id, ''));
    clientMap[id] = `${getValue(c.firstname, '')} ${getValue(c.lastname, '')}`.trim();
  });

  const adresseMap = {};
  lireCollectionRessource(resAddresses.donnees, 'address').forEach((a) => {
    const id = String(getValue(a.id, ''));
    adresseMap[id] = String(getValue(a.id_country, ''));
  });

  const paysMap = {};
  lireCollectionRessource(resCountries.donnees, 'country').forEach((p) => {
    const id = String(getValue(p.id, ''));
    paysMap[id] = getLangValue(p.name, 1) || String(getValue(p.name, ''));
  });

  const etatMap = {};
  lireCollectionRessource(resStates.donnees, 'order_state').forEach((e) => {
    const id = String(getValue(e.id, ''));
    etatMap[id] = getLangValue(e.name, 1) || String(getValue(e.name, ''));
  });

  // Construire liste de commandes enrichies
  const commandes = lireCollectionRessource(resOrders.donnees, 'order').map((o) => ({
    id: String(getValue(o.id, '')),
    reference: String(getValue(o.reference, '')),
    idClient: String(getValue(o.id_customer, '')),
    idAdresseLivraison: String(getValue(o.id_address_delivery, '')),
    idEtat: String(getValue(o.current_state, '')),
    paiement: String(getValue(o.payment, '')),
    total: getNumber(o.total_paid_tax_incl, 0),
    dateAjout: String(getValue(o.date_add, '')),
  }));

  // Calculer "nouveau client" : première commande du client (par date_add)
  const premiereCommandeParClient = {};
  commandes.forEach((c) => {
    const existing = premiereCommandeParClient[c.idClient];
    if (!existing || c.dateAjout < existing) {
      premiereCommandeParClient[c.idClient] = c.dateAjout;
    }
  });

  return commandes.map((c) => ({
    ...c,
    client: clientMap[c.idClient] || `Client #${c.idClient}`,
    livraison: paysMap[adresseMap[c.idAdresseLivraison]] || '—',
    etatLibelle: etatMap[c.idEtat] || `État #${c.idEtat}`,
    nouveauClient: premiereCommandeParClient[c.idClient] === c.dateAjout ? 'Oui' : 'Non',
  }));
}

/**
 * Charge une seule commande par son ID.
 * @param {string|number} idCommande
 * @returns {Promise<object>}
 */
export async function obtenirCommande(idCommande) {
  const { donnees } = await requeteApi(`orders/${idCommande}?display=full`);
  const collection = lireCollectionRessource(donnees, 'order');
  if (collection.length === 0) throw new Error(`Commande ${idCommande} introuvable`);
  return collection[0];
}

async function listerLignesCommande(idCommande) {
  const { donnees } = await requeteApi(
    `order_details?filter[id_order]=[${idCommande}]&display=[product_id,product_attribute_id,product_quantity]`
  );

  return lireCollectionRessource(donnees, 'order_detail')
    .map((ligne) => ({
      idProduit: String(getValue(ligne.product_id, '0')),
      idDeclinaison: String(getValue(ligne.product_attribute_id, '0') || '0'),
      quantite: getNumber(ligne.product_quantity, 0),
    }))
    .filter((ligne) => ligne.idProduit !== '0' && ligne.quantite > 0);
}

async function listerStocksDisponibles(idProduit, idDeclinaison) {
  const { donnees } = await requeteApi(
    `stock_availables?filter[id_product]=[${idProduit}]&filter[id_product_attribute]=[${idDeclinaison}]&display=[id,id_shop,id_shop_group]`
  );

  return lireCollectionRessource(donnees, 'stock_available').map((stock) => ({
    id: String(getValue(stock.id, '0')),
    idShop: String(getValue(stock.id_shop, '0')),
    idShopGroup: String(getValue(stock.id_shop_group, '0')),
  }));
}

async function reinjecterStockLigne(idProduit, idDeclinaison, quantite) {
  const stocks = await listerStocksDisponibles(idProduit, idDeclinaison);
  if (!stocks.length) {
    throw new Error(`Aucun stock_available trouvé pour le produit ${idProduit}/${idDeclinaison}`);
  }

  for (const stock of stocks) {
    const { texte } = await requeteApi(
      `stock_availables/${stock.id}?display=[id,id_product,id_product_attribute,id_shop,id_shop_group,quantity,depends_on_stock,out_of_stock,location]`
    );

    let xmlStock = texte;
    const quantiteActuelleMatch = xmlStock.match(/<quantity>([^<]*)<\/quantity>/);
    const quantiteActuelle = quantiteActuelleMatch ? Number(quantiteActuelleMatch[1]) || 0 : 0;
    const nouvelleQuantite = quantiteActuelle + quantite;

    xmlStock = xmlStock.replace(/<quantity>([^<]*)<\/quantity>/, `<quantity>${nouvelleQuantite}</quantity>`);
    xmlStock = xmlStock.replace(/ xlink:href="[^"]*"/g, '');

    await requeteApi(`stock_availables/${stock.id}`, {
      method: 'PUT',
      body: xmlStock,
    });
  }
}

async function reinjecterStockCommande(idCommande) {
  const lignes = await listerLignesCommande(idCommande);
  for (const ligne of lignes) {
    await reinjecterStockLigne(ligne.idProduit, ligne.idDeclinaison, ligne.quantite);
  }
}

// ────────────────────────────────────────────────────────────
// Changement d'état
// ────────────────────────────────────────────────────────────

/**
 * Change l'état d'une commande en créant un order_history.
 * @param {string|number} idCommande
 * @param {string|number} idEtat
 * @returns {Promise<void>}
 */
/**
 * Change l'état d'une commande.
 * Étape 1 : POST order_history → déclenche les hooks PrestaShop
 *           (actionOrderStatusUpdate : stock, emails, etc.)
 * Étape 2 : GET + PUT orders/{id} → met à jour current_state dans ps_orders
 * @param {string|number} idCommande
 * @param {string|number} idEtat
 * @returns {Promise<void>}
 */
export async function changerEtatCommande(idCommande, idEtat) {
  if (String(idEtat) === '19') {
    return;
  }

  const dateNow = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const commandeActuelle = await obtenirCommande(idCommande);
  const ancienEtat = String(getValue(commandeActuelle.current_state, ''));

  // ── Étape 1 : historique (déclenche stock + hooks PrestaShop)
  const xmlHistory = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
  <order_history>
    <id_employee>0</id_employee>
    <id_order_state>${idEtat}</id_order_state>
    <id_order>${idCommande}</id_order>
    <date_add>${dateNow}</date_add>
  </order_history>
</prestashop>`;

  const resHistory = await requeteApi('order_histories', {
    method: 'POST',
    body: xmlHistory,
  });

  if (!resHistory.reponse.ok) {
    const msg = hasError(resHistory.donnees)
      ? getErrorMessage(resHistory.donnees)
      : resHistory.texte.slice(0, 200);
    throw new Error(`Erreur création historique (${resHistory.reponse.status}): ${msg}`);
  }

  // ── Étape 2 : GET commande complète → modifier current_state → PUT
  const resGet = await requeteApi(`orders/${idCommande}?display=full`);
  if (hasError(resGet.donnees)) throw new Error(getErrorMessage(resGet.donnees));

  // Modifier current_state dans le XML brut puis supprimer les xlink:href
  // (PrestaShop refuse le PUT si les liens sont présents)
  let xmlOrder = resGet.texte;
  xmlOrder = xmlOrder.replace(
    /<current_state>([^<]*)<\/current_state>/,
    `<current_state>${idEtat}</current_state>`
  );
  xmlOrder = xmlOrder.replace(/ xlink:href="[^"]*"/g, '');

  const resPut = await requeteApi(`orders/${idCommande}`, {
    method: 'PUT',
    body: xmlOrder,
  });

  if (!resPut.reponse.ok) {
    const msg = hasError(resPut.donnees)
      ? getErrorMessage(resPut.donnees)
      : resPut.texte.slice(0, 200);
    throw new Error(`Erreur mise à jour commande (${resPut.reponse.status}): ${msg}`);
  }

  if (String(idEtat) === '6' && ancienEtat !== '6') {
    await reinjecterStockCommande(idCommande);
  }
}
