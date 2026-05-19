/**
 * commandeCLIENTAPI.js
 *
 * Validation commande front-office avec mode de paiement unique:
 * - Paiement a la livraison
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
  obtenirOuCreerPanierClient,
  afficherPanierComplet,
  supprimerPanier,
} from './panierAPI';

const URL_API =
  process.env.NODE_ENV === 'production'
    ? process.env.REACT_APP_PRESTASHOP_API_URL
    : '/evals/api';

const MODE_PAIEMENT_LIVRAISON = 'Paiement a la livraison';
const MODULE_PAIEMENT_LIVRAISON = 'ps_cashondelivery';

const enEntier = (valeur, defaut = 0) => {
  const n = parseInt(valeur, 10);
  return Number.isNaN(n) ? defaut : n;
};

const enNombre = (valeur, defaut = 0) => {
  const normalisee = String(valeur ?? '').replace(',', '.').replace(/\s/g, '');
  const n = parseFloat(normalisee);
  return Number.isNaN(n) ? defaut : n;
};

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

  return { donnees };
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

const trouverPremierCarrierId = async () => {
  const { donnees } = await requeteApi('carriers?filter[active]=[1]&display=[id]&limit=1');
  const liste = lireCollectionRessource(donnees, 'carrier');
  if (!liste.length) return 0;
  return enEntier(getValue(liste[0]?.id, 0), 0);
};

const trouverEtatPaiementLivraisonId = async () => {
  const { donnees } = await requeteApi('order_states?display=[id,name]&limit=100');
  const states = lireCollectionRessource(donnees, 'order_state');
  const aliases = [
    'en attente de paiement a la livraison',
    'en attente paiement a la livraison',
    'cash on delivery',
  ];

  const trouve = states.find((state) => {
    const nom = normaliserTexte(getLangValue(state?.name, 1) || getValue(state?.name, ''));
    return aliases.some((alias) => normaliserTexte(alias) === nom);
  });

  if (trouve) return enEntier(getValue(trouve?.id, 0), 0);
  return 0;
};

const creerCommandeDepuisPanier = async ({ cart, idCart, idClient, totalTtc, idCarrier, idEtat }) => {
  const idAdresseLivraison = enEntier(getValue(cart?.id_address_delivery, 0), 0);
  const idAdresseFacturation = enEntier(getValue(cart?.id_address_invoice, idAdresseLivraison), idAdresseLivraison);
  const idCurrency = enEntier(getValue(cart?.id_currency, 1), 1);
  const idLang = enEntier(getValue(cart?.id_lang, 1), 1);

  if (!idAdresseLivraison || !idAdresseFacturation) {
    throw new Error('Adresse client manquante pour valider la commande');
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order>
    <id_address_delivery>${idAdresseLivraison}</id_address_delivery>
    <id_address_invoice>${idAdresseFacturation}</id_address_invoice>
    <id_cart>${idCart}</id_cart>
    <id_currency>${idCurrency}</id_currency>
    <id_lang>${idLang}</id_lang>
    <id_customer>${idClient}</id_customer>
    <id_carrier>${idCarrier}</id_carrier>
    <current_state>${enEntier(idEtat, 0)}</current_state>
    <payment>${nettoyerTexte(MODE_PAIEMENT_LIVRAISON)}</payment>
    <module>${nettoyerTexte(MODULE_PAIEMENT_LIVRAISON)}</module>
    <recyclable>0</recyclable>
    <gift>0</gift>
    <gift_message></gift_message>
    <mobile_theme>0</mobile_theme>
    <total_discounts>0</total_discounts>
    <total_discounts_tax_incl>0</total_discounts_tax_incl>
    <total_discounts_tax_excl>0</total_discounts_tax_excl>
    <total_paid>${totalTtc.toFixed(6)}</total_paid>
    <total_paid_tax_incl>${totalTtc.toFixed(6)}</total_paid_tax_incl>
    <total_paid_tax_excl>${totalTtc.toFixed(6)}</total_paid_tax_excl>
    <total_paid_real>0.000000</total_paid_real>
    <total_products>${totalTtc.toFixed(6)}</total_products>
    <total_products_wt>${totalTtc.toFixed(6)}</total_products_wt>
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
  if (!idOrder) throw new Error('Creation commande impossible');
  return idOrder;
};

export async function chargerResumeCommandeClient(idClient) {
  if (!idClient) throw new Error('Client non connecte');

  const panier = await obtenirOuCreerPanierClient(idClient);
  const contenu = await afficherPanierComplet(panier.id);
  return {
    idCart: panier.id,
    modePaiement: MODE_PAIEMENT_LIVRAISON,
    panier: contenu.panier,
    produits: contenu.produits,
    totalTtc: enNombre(contenu.totalTtc, 0),
    totalHt: enNombre(contenu.totalHt, 0),
    quantiteTotale: enEntier(contenu.quantiteTotale, 0),
  };
}

export async function validerCommandePaiementLivraison(idClient) {
  if (!idClient) throw new Error('Client non connecte');

  const panier = await obtenirOuCreerPanierClient(idClient);
  const contenu = await afficherPanierComplet(panier.id);

  if (!contenu?.produits?.length) {
    throw new Error('Panier vide: impossible de valider la commande');
  }

  const totalTtc = enNombre(contenu.totalTtc, 0);
  if (totalTtc <= 0) {
    throw new Error('Total panier invalide');
  }

  const { donnees: donneesCart } = await requeteApi(`carts/${panier.id}?display=full`);
  const cart = lireRessourceSimple(donneesCart, 'cart');
  if (!cart) throw new Error(`Panier ${panier.id} introuvable`);

  const idCarrier = await trouverPremierCarrierId();
  if (!idCarrier) throw new Error('Aucun transporteur actif trouve');

  const idEtatLivraison = await trouverEtatPaiementLivraisonId();

  const idOrder = await creerCommandeDepuisPanier({
    cart,
    idCart: panier.id,
    idClient,
    totalTtc,
    idCarrier,
    idEtat: idEtatLivraison,
  });

  // Une fois la commande creee, on tente de supprimer le panier courant.
  // PrestaShop peut refuser DELETE pour un panier deja converti en commande.
  // Dans ce cas, on n'interrompt pas le checkout.
  try {
    await supprimerPanier(panier.id);
  } catch (erreurSuppressionPanier) {
    console.warn(
      `[commande-client] Suppression panier ${panier.id} impossible apres commande ${idOrder}: ${erreurSuppressionPanier.message}`
    );
  }

  return {
    idOrder,
    idCart: panier.id,
    totalTtc,
    modePaiement: MODE_PAIEMENT_LIVRAISON,
  };
}
