/**
 * importFichier2API.js
 *
 * Import du fichier 2 (declinaisons, attributs et stock).
 */

import {
  parsePrestaXML,
  getCollection,
  getErrorMessage,
  getValue,
  getNumber,
  getLangValue,
  hasError,
} from '../config/parserXML';
import {
  validerColonnesObligatoires,
  validerMontantPositif,
} from './exceptionAPI';

// URL de base de l'API PrestaShop (proxy local en dev)
let URL_API = '/evals/api';
if (process.env.NODE_ENV === 'production') {
  URL_API = process.env.REACT_APP_PRESTASHOP_API_URL;
} else {
  URL_API = '/evals/api';
}

// ─── Configuration par défaut ────────────────────────────────────────────────

export const CONFIG_FICHIER2 = {
  idLangue: 1,
  idBoutique: 1,
  idShopGroup: 0,
  separateur: 'auto', // détection automatique , ou ;
  lignesAIgnorer: 1,  // 1 ligne d'en-tête
};

// Ressources/tables manipulees par l'import fichier 2.
export const TABLES_FICHIER2 = [
  'products',
  'product_options',
  'product_option_values',
  'combinations',
  'stock_availables',
  'tax_rules',
  'taxes',
];

// Champs disponibles pour le mapping CSV → import
export const PRESTA_FIELDS_FICHIER2 = [
  { value: '', label: 'Ignorer cette colonne' },
  { value: 'reference', label: 'Référence produit' },
  { value: 'specificite', label: 'Spécificité (groupe attribut)' },
  { value: 'karazany', label: 'Karazany (valeur attribut)' },
  { value: 'stock_initial', label: 'Stock initial' },
  { value: 'prix_vente_ttc', label: 'Prix vente TTC' },
];

// Mapping automatique des en-têtes CSV vers les champs internes
const ENTETES_VERS_CHAMP = {
  reference: 'reference',
  ref: 'reference',
  specificite: 'specificite',
  karazany: 'karazany',
  valeur: 'karazany',
  stock_initial: 'stock_initial',
  stock: 'stock_initial',
  'stock initial': 'stock_initial',
  prix_vente_ttc: 'prix_vente_ttc',
  'prix vente ttc': 'prix_vente_ttc',
  prix_ttc: 'prix_vente_ttc',
};

// ─── Helpers texte ────────────────────────────────────────────────────────────

// Échappe les caractères spéciaux XML
const nettoyerTexte = (texte = '') =>
  String(texte)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

// Normalise un texte en minuscules sans accents ni caractères spéciaux
const normaliserTexte = (texte = '') =>
  String(texte)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Convertit une valeur en nombre (gère les virgules comme décimales)
const enNombre = (valeur, defaut = 0) => {
  const normalisee = String(valeur ?? '').replace(',', '.').replace(/\s/g, '');
  const n = parseFloat(normalisee);
  if (Number.isNaN(n)) {
    return defaut;
  } else {
    return n;
  }
};

// Convertit une valeur en entier
const enEntier = (valeur, defaut = 0) => {
  const n = parseInt(valeur, 10);
  if (Number.isNaN(n)) {
    return defaut;
  } else {
    return n;
  }
};

// ─── Parser CSV ───────────────────────────────────────────────────────────────

const detecterSeparateur = (contenu) => {
  const premiereLigne = String(contenu || '').replace(/^\uFEFF/, '').split(/\r?\n/)[0] || '';
  const nbVirgules = (premiereLigne.match(/,/g) || []).length;
  const nbPointVirgules = (premiereLigne.match(/;/g) || []).length;
  if (nbVirgules >= nbPointVirgules) {
    return ',';
  } else {
    return ';';
  }
};

// Parser CSV qui gère les guillemets et les virgules dans les valeurs
const parserCsvSimple = (contenu, separateur = ';') => {
  const lignes = String(contenu || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (!lignes.length) return { headers: [], rows: [] };

  const parseLine = (ligne) => {
    const cellules = [];
    let current = '';
    let insideQuotes = false;

    for (let i = 0; i < ligne.length; i += 1) {
      const char = ligne[i];
      const next = ligne[i + 1];

      // Guillemet doublé à l'intérieur = guillemet littéral
      if (char === '"' && next === '"' && insideQuotes) {
        current += '"';
        i += 1;
        continue;
      }

      if (char === '"') { insideQuotes = !insideQuotes; continue; }

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

  return { headers: parseLine(lignes[0]), rows: lignes.slice(1).map(parseLine) };
};

// Lit le fichier CSV et retourne les en-têtes + lignes
const lireApercuCsv = (file, separateur = 'auto', maxRows = 0) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const contenu = String(event.target.result || '').replace(/^\uFEFF/, '');
      let sep = separateur;
      if (separateur === 'auto') {
        sep = detecterSeparateur(contenu);
      } else {
        sep = separateur;
      }
      const parsed = parserCsvSimple(contenu, sep);
      let rows = parsed.rows;
      if (maxRows > 0) {
        rows = parsed.rows.slice(0, maxRows);
      } else {
        rows = parsed.rows;
      }
      resolve({ headers: parsed.headers, rows, separateur: sep });
    };
    reader.onerror = reject;
    reader.readAsText(file, 'utf-8');
  });

// Construit un objet ligne à partir du tableau de cellules + mapping colonne→champ
const construireLigne = (entetes, cellules, mapping) => {
  const objet = {};
  entetes.forEach((_, index) => {
    const champ = mapping[index];
    if (!champ) return;
    objet[champ] = (cellules[index] || '').trim();
  });
  return objet;
};

// ─── Détection automatique du mapping ────────────────────────────────────────

export const detecterMappingFichier2 = (headers) =>
  headers.map((header) => {
    const h = normaliserTexte(header);
    if (ENTETES_VERS_CHAMP[h]) return ENTETES_VERS_CHAMP[h];
    const match = PRESTA_FIELDS_FICHIER2.find(
      (f) => f.value && (normaliserTexte(f.value) === h || normaliserTexte(f.label) === h)
    );
    if (match) {
      return match.value;
    } else {
      return '';
    }
  });

// ─── Client API générique ─────────────────────────────────────────────────────

const requeteApi = async (chemin, options = {}) => {
  const { methode = 'GET', xml = null } = options;
  const init = { method: methode, credentials: 'include', headers: {} };

  if (xml !== null) {
    init.headers['Content-Type'] = 'application/xml';
    init.body = xml;
  }

  const reponse = await fetch(`${URL_API}/${chemin}`, init);
  const texte = await reponse.text();
  let donnees = null;
  if (texte) {
    donnees = parsePrestaXML(texte);
  } else {
    donnees = null;
  }

  if (!reponse.ok) {
    let messageApi = '';
    if (donnees) {
      messageApi = getErrorMessage(donnees);
    } else {
      messageApi = '';
    }
    let suffixeErreur = '';
    if (messageApi) {
      suffixeErreur = ` - ${messageApi}`;
    } else {
      suffixeErreur = '';
    }
    throw new Error(
      `HTTP ${reponse.status} ${methode} /${chemin}${suffixeErreur}`
    );
  }

  // PrestaShop peut retourner HTTP 200 avec un bloc <errors> dans le XML
  if (donnees && hasError(donnees)) {
    const messageApi = getErrorMessage(donnees) || 'Erreur API PrestaShop';
    throw new Error(`${methode} /${chemin} - ${messageApi}`);
  }

  return { reponse, texte, donnees };
};

// Lit la ressource unique d'une réponse API (ex: le product créé)
const lireCollectionRessource = (donnees, nom) => {
  const direct = getCollection(donnees, nom);
  if (direct.length) {
    return direct;
  }

  const pluriels = [`${nom}s`, `${nom}es`];
  for (const nomPluriel of pluriels) {
    const conteneur = donnees?.prestashop?.[nomPluriel];
    if (!conteneur) {
      continue;
    }

    if (Array.isArray(conteneur)) {
      return conteneur;
    }

    const contenu = conteneur?.[nom];
    if (Array.isArray(contenu)) {
      return contenu;
    }

    if (contenu) {
      return [contenu];
    }
  }

  return [];
};

const lireRessourceSimple = (donnees, nom) => {
  const noeud = donnees?.prestashop?.[nom];
  if (Array.isArray(noeud)) return noeud[0] || null;
  if (noeud) return noeud;

  const collection = lireCollectionRessource(donnees, nom);
  if (collection.length) {
    return collection[0];
  }

  return null;
};

// Cherche l'id d'un premier élément d'une collection filtrée
const trouverCollectionId = async (url, collectionName) => {
  const { donnees } = await requeteApi(url);
  const items = lireCollectionRessource(donnees, collectionName);
  if (!items.length) return null;
  const id = getNumber(items[0]?.id, null);
  if (id === null) {
    return null;
  } else {
    return enEntier(id, null);
  }
};

// ─── Produit : trouver par référence ─────────────────────────────────────────

// Retourne l'id du produit ainsi que son prix HT et son groupe de taxe
const trouverProduitParReference = async (reference) => {
  if (!reference) return null;

  const referenceCible = String(reference).trim();
  const cleReference = normaliserTexte(referenceCible);
  const extraireReference = (produit) => String(getValue(produit?.reference, '') || '').trim();

  const toProduitInfo = (produit) => ({
    id: enEntier(getNumber(produit?.id, 0), 0),
    prixHt: enNombre(produit?.price, 0),
    idGroupeTaxe: enEntier(getNumber(produit?.id_tax_rules_group, 0), 0),
  });

  const lireProduitParId = async (idProduit) => {
    const { donnees: donneesProduit } = await requeteApi(
      `products/${idProduit}?display=[id,reference,price,id_tax_rules_group]`
    );
    const produit = lireRessourceSimple(donneesProduit, 'product');
    if (!produit) return null;
    return produit;
  };

  const filtre = encodeURIComponent(referenceCible);
  const { donnees } = await requeteApi(
    `products?filter[reference]=[${filtre}]&display=[id,reference,price,id_tax_rules_group]`
  );
  const items = lireCollectionRessource(donnees, 'product');
  if (items.length) {
    const produitExact = items.find((item) => {
      const ref = extraireReference(item);
      return normaliserTexte(ref) === cleReference;
    });

    if (produitExact) {
      return toProduitInfo(produitExact);
    }

    // Certaines réponses liste ne renvoient que les ids; on charge alors le détail.
    for (const item of items) {
      const idProduit = enEntier(getNumber(item?.id, 0), 0);
      if (!idProduit) continue;
      const detail = await lireProduitParId(idProduit);
      if (!detail) continue;
      const refDetail = extraireReference(detail);
      if (normaliserTexte(refDetail) === cleReference) {
        return toProduitInfo(detail);
      }
    }
  }

  // Fallback robuste: certaines versions PS filtrent mal le champ reference via l'API.
  const { donnees: donneesTousProduits } = await requeteApi(
    'products?display=[id,reference,price,id_tax_rules_group]&limit=500'
  );
  const produits = lireCollectionRessource(donneesTousProduits, 'product');
  const produitTrouve = produits.find((produit) => {
    const ref = extraireReference(produit);
    return normaliserTexte(ref) === cleReference;
  });
  if (produitTrouve) {
    return toProduitInfo(produitTrouve);
  }

  // Dernier fallback: scan des ids puis lecture détaillée produit par produit.
  for (const produit of produits) {
    const idProduit = enEntier(getNumber(produit?.id, 0), 0);
    if (!idProduit) continue;
    const detail = await lireProduitParId(idProduit);
    if (!detail) continue;
    const refDetail = extraireReference(detail);
    if (normaliserTexte(refDetail) === cleReference) {
      return toProduitInfo(detail);
    }
  }

  return null;
};

// ─── Taxe : récupérer le taux depuis le groupe ────────────────────────────────

// Récupère le taux de taxe (%) lié à un groupe de taxe
const obtenirTauxTaxeDepuisGroupe = async (idGroupeTaxe) => {
  if (!idGroupeTaxe) return 0;

  // On récupère les règles de taxe pour ce groupe
  const { donnees: donneesRegles } = await requeteApi(
    `tax_rules?filter[id_tax_rules_group]=[${idGroupeTaxe}]&display=[id_tax]&limit=1`
  );
  const regles = getCollection(donneesRegles, 'tax_rule');
  if (!regles.length) {
    // Fallback : lire le nom du groupe et en extraire le % s'il est de la forme "TVA 20.000%"
    const { donnees: donneesGroupe } = await requeteApi(
      `tax_rule_groups/${idGroupeTaxe}?display=[id,name]`
    );
    const groupe = lireRessourceSimple(donneesGroupe, 'tax_rule_group');
    const nom = String(groupe?.name || '');
    const match = nom.match(/([0-9]+(?:[.,][0-9]+)?)\s*%/);
    if (!match) return 0;
    return enNombre(match[1], 0);
  }

  const idTaxe = enEntier(getNumber(regles[0]?.id_tax, 0), 0);
  if (!idTaxe) return 0;

  const { donnees: donneesRate } = await requeteApi(`taxes/${idTaxe}?display=[id,rate]`);
  const taxe = lireRessourceSimple(donneesRate, 'tax');
  return enNombre(taxe?.rate, 0);
};

// ─── Groupe attribut (product_option) ────────────────────────────────────────

const trouverGroupeAttributParNom = async (nom) => {
  const filtre = encodeURIComponent(String(nom));

  // Essai 1 : filtre direct
  const idParFiltre = await trouverCollectionId(
    `product_options?filter[name]=[${filtre}]&display=[id]`,
    'product_option'
  );
  if (idParFiltre) return idParFiltre;

  // Fallback : scan complet de la liste (noms multilingues)
  const { donnees } = await requeteApi('product_options?display=[id,name]&limit=200');
  const groupes = getCollection(donnees, 'product_option');
  const cible = normaliserTexte(nom);
  const trouve = groupes.find(
    (g) => normaliserTexte(getLangValue(g?.name, 1) || '') === cible
  );
  if (!trouve) return null;
  return enEntier(getNumber(trouve?.id, 0), null);
};

const creerGroupeAttributApi = async (nom, config) => {
  console.log('[fichier2] POST product_options', {
    table: 'ps_attribute_group / ps_attribute_group_lang',
    name: nom,
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <product_option>
    <group_type>select</group_type>
    <is_color_group>0</is_color_group>
    <position>0</position>
    <name><language id="${config.idLangue}">${nettoyerTexte(nom)}</language></name>
    <public_name><language id="${config.idLangue}">${nettoyerTexte(nom)}</language></public_name>
  </product_option>
</prestashop>`;

  const { donnees } = await requeteApi('product_options', { methode: 'POST', xml });
  const groupe = lireRessourceSimple(donnees, 'product_option');
  const id = enEntier(getNumber(groupe?.id, 0), 0);
  if (!id) throw new Error(`Impossible de recuperer id_attribute_group apres creation (${nom})`);
  return id;
};

// Obtient l'id du groupe attribut existant ou en crée un nouveau
const obtenirOuCreerGroupeAttribut = async (nom, config, cache) => {
  const cle = normaliserTexte(nom);
  if (cache.groupesAttributs.has(cle)) return cache.groupesAttributs.get(cle);

  const idExistant = await trouverGroupeAttributParNom(nom);
  if (idExistant) {
    console.log('[fichier2] groupe attribut existant reutilise', { name: nom, id: idExistant });
    cache.groupesAttributs.set(cle, idExistant);
    return idExistant;
  }

  const idCree = await creerGroupeAttributApi(nom, config);
  cache.groupesAttributs.set(cle, idCree);
  return idCree;
};

// ─── Valeur attribut (product_option_value) ───────────────────────────────────

const trouverValeurAttribut = async (idGroupe, valeur) => {
  const filtre = encodeURIComponent(String(valeur));

  // Essai 1 : filtre direct
  const idParFiltre = await trouverCollectionId(
    `product_option_values?filter[id_attribute_group]=[${idGroupe}]&filter[name]=[${filtre}]&display=[id]`,
    'product_option_value'
  );
  if (idParFiltre) return idParFiltre;

  // Fallback : scan de toutes les valeurs du groupe
  const { donnees } = await requeteApi(
    `product_option_values?filter[id_attribute_group]=[${idGroupe}]&display=[id,name]&limit=200`
  );
  const valeurs = getCollection(donnees, 'product_option_value');
  const cible = normaliserTexte(valeur);
  const trouvee = valeurs.find(
    (v) => normaliserTexte(getLangValue(v?.name, 1) || '') === cible
  );
  if (!trouvee) return null;
  return enEntier(getNumber(trouvee?.id, 0), null);
};

const creerValeurAttributApi = async (idGroupe, valeur, config) => {
  console.log('[fichier2] POST product_option_values', {
    table: 'ps_attribute / ps_attribute_lang',
    id_attribute_group: idGroupe,
    name: valeur,
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <product_option_value>
    <id_attribute_group>${idGroupe}</id_attribute_group>
    <color></color>
    <position>0</position>
    <name><language id="${config.idLangue}">${nettoyerTexte(valeur)}</language></name>
  </product_option_value>
</prestashop>`;

  const { donnees } = await requeteApi('product_option_values', { methode: 'POST', xml });
  const attr = lireRessourceSimple(donnees, 'product_option_value');
  const id = enEntier(getNumber(attr?.id, 0), 0);
  if (!id) throw new Error(`Impossible de recuperer id_attribute apres creation (${valeur})`);
  return id;
};

// Obtient l'id de la valeur attribut existante ou en crée une nouvelle
const obtenirOuCreerValeurAttribut = async (idGroupe, valeur, config, cache) => {
  const cle = `${idGroupe}__${normaliserTexte(valeur)}`;
  if (cache.valeursAttributs.has(cle)) return cache.valeursAttributs.get(cle);

  const idExistant = await trouverValeurAttribut(idGroupe, valeur);
  if (idExistant) {
    console.log('[fichier2] valeur attribut existante reutilisee', { idGroupe, valeur, id: idExistant });
    cache.valeursAttributs.set(cle, idExistant);
    return idExistant;
  }

  const idCree = await creerValeurAttributApi(idGroupe, valeur, config);
  cache.valeursAttributs.set(cle, idCree);
  return idCree;
};

// ─── Déclinaison (combination) ────────────────────────────────────────────────

const construireReferenceDeclinaison = (referenceProduit, specificite, karazany) => {
  const base = `${referenceProduit || ''}_${specificite || ''}_${karazany || ''}`;
  const nettoyee = normaliserTexte(base)
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .toUpperCase();

  if (!nettoyee) {
    return 'COMBI';
  }

  return nettoyee.slice(0, 64);
};

// Cherche si une déclinaison existe déjà pour ce produit avec cette valeur attribut
const trouverDeclinaison = async (idProduit, referenceDeclinaison) => {
  if (!referenceDeclinaison) return null;

  const filtreRef = encodeURIComponent(referenceDeclinaison);
  const { donnees } = await requeteApi(
    `combinations?filter[id_product]=[${idProduit}]&filter[reference]=[${filtreRef}]&display=[id,reference]&limit=5`
  );
  const combis = lireCollectionRessource(donnees, 'combination');
  for (const combi of combis) {
    const ref = String(getValue(combi?.reference, '') || '').trim();
    if (normaliserTexte(ref) === normaliserTexte(referenceDeclinaison)) {
      return enEntier(getNumber(combi?.id, 0), null);
    }
  }

  return null;
};

const creerDeclinaisonApi = async (idProduit, idValeurAttribut, deltaPrix, referenceDeclinaison) => {
  // PrestaShop stocke un delta par rapport au prix de base du produit (peut être négatif)
  console.log('[fichier2] POST combinations', {
    table: 'ps_product_attribute / ps_product_attribute_combination',
    id_product: idProduit,
    id_product_option_value: idValeurAttribut,
    reference: referenceDeclinaison,
    delta_prix: deltaPrix.toFixed(6),
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <combination>
    <id_product>${idProduit}</id_product>
    <price>${deltaPrix.toFixed(6)}</price>
    <weight>0</weight>
    <quantity>0</quantity>
    <minimal_quantity>1</minimal_quantity>
    <reference>${nettoyerTexte(referenceDeclinaison || '')}</reference>
    <active>1</active>
    <associations>
      <product_option_values>
        <product_option_value>
          <id>${idValeurAttribut}</id>
        </product_option_value>
      </product_option_values>
    </associations>
  </combination>
</prestashop>`;

  const { donnees } = await requeteApi('combinations', { methode: 'POST', xml });
  const combi = lireRessourceSimple(donnees, 'combination');
  const id = enEntier(getNumber(combi?.id, 0), 0);
  if (!id) throw new Error(`Impossible de recuperer id_combination apres creation (produit ${idProduit})`);
  return id;
};

// ─── Stock ────────────────────────────────────────────────────────────────────

// Met à jour le stock disponible pour un produit (avec ou sans déclinaison)
const creerStockAvailableApi = async (idProduit, idDeclinaison, quantite, config) => {
  const idAttr = idDeclinaison || 0;

  console.log('[fichier2] POST stock_availables', {
    table: 'ps_stock_available',
    id_product: idProduit,
    id_product_attribute: idAttr,
    id_shop: enEntier(config.idBoutique, 1),
    id_shop_group: enEntier(config.idShopGroup, 1),
    quantity: enEntier(quantite, 0),
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <stock_available>
    <id_product>${idProduit}</id_product>
    <id_product_attribute>${idAttr}</id_product_attribute>
    <id_shop>${enEntier(config.idBoutique, 1)}</id_shop>
    <id_shop_group>${enEntier(config.idShopGroup, 1)}</id_shop_group>
    <quantity>${enEntier(quantite, 0)}</quantity>
    <depends_on_stock>0</depends_on_stock>
    <out_of_stock>2</out_of_stock>
  </stock_available>
</prestashop>`;

  const { donnees } = await requeteApi('stock_availables', { methode: 'POST', xml });
  const stock = lireRessourceSimple(donnees, 'stock_available');
  const idStock = enEntier(getNumber(stock?.id, 0), 0);
  if (!idStock) {
    throw new Error(`Impossible de recuperer id_stock_available apres creation (produit ${idProduit})`);
  }
  return idStock;
};

const mettreAJourStockApi = async (idProduit, idDeclinaison, quantite, config) => {
  // id_product_attribute = 0 → stock du produit de base (sans déclinaison)
  const idAttr = idDeclinaison || 0;
  const idShop = enEntier(config.idBoutique, 1);
  const idShopGroup = enEntier(config.idShopGroup, 0);

  console.log('[fichier2] PUT stock_availables', {
    table: 'ps_stock_available',
    id_product: idProduit,
    id_product_attribute: idAttr,
    id_shop: idShop,
    id_shop_group: idShopGroup,
    quantity: quantite,
  });

  // Étape 1 : trouver les lignes stock_available existantes pour ce produit/déclinaison.
  // En multiboutique, plusieurs lignes peuvent coexister (id_shop=0 et id_shop=1).
  const { donnees } = await requeteApi(
    `stock_availables?filter[id_product]=[${idProduit}]&filter[id_product_attribute]=[${idAttr}]&display=[id,id_shop,id_shop_group]`
  );
  const stocks = lireCollectionRessource(donnees, 'stock_available');
  let stocksCibles = [];
  if (stocks.length) {
    const lignesShopEtGroupe = stocks.filter((s) =>
      enEntier(getNumber(s?.id_shop, 0), 0) === idShop
      && enEntier(getNumber(s?.id_shop_group, 0), 0) === idShopGroup
    );
    const lignesMemeShop = stocks.filter(
      (s) => enEntier(getNumber(s?.id_shop, 0), 0) === idShop
    );
    const lignesGlobales = stocks.filter(
      (s) => enEntier(getNumber(s?.id_shop, 0), 0) === 0
    );

    if (lignesShopEtGroupe.length) {
      stocksCibles = lignesShopEtGroupe;
    } else if (lignesMemeShop.length) {
      stocksCibles = lignesMemeShop;
    } else if (lignesGlobales.length) {
      stocksCibles = lignesGlobales;
    } else {
      stocksCibles = stocks;
    }
  }

  if (!stocksCibles.length) {
    console.warn('[fichier2] stock_available introuvable, creation en cours', {
      id_product: idProduit,
      id_product_attribute: idAttr,
    });
    try {
      const idStockCree = await creerStockAvailableApi(idProduit, idDeclinaison, quantite, config);
      stocksCibles = [{ id: idStockCree, id_shop: idShop, id_shop_group: idShopGroup }];
    } catch (erreurCreation) {
      if (String(erreurCreation?.message || '').includes('Method POST is not allowed for the resource stock_availables')) {
        console.warn('[fichier2] creation stock_available non autorisee par le webservice, ligne ignoree');
        return null;
      }
      throw erreurCreation;
    }
  }

  // Étape 2 : mettre à jour toutes les lignes cibles via PUT.
  // Cela évite un décalage BO/FO quand plusieurs lignes existent pour un même couple produit/déclinaison.
  for (const stock of stocksCibles) {
    const idStock = enEntier(getNumber(stock?.id, 0), 0);
    if (!idStock) {
      continue;
    }
    const rowShop = enEntier(getNumber(stock?.id_shop, idShop), idShop);
    const rowShopGroup = enEntier(getNumber(stock?.id_shop_group, idShopGroup), idShopGroup);

    const { donnees: donneesStock } = await requeteApi(
      `stock_availables/${idStock}?display=[id,id_product,id_product_attribute,id_shop,id_shop_group,depends_on_stock,out_of_stock,location]`
    );
    const stockComplet = lireRessourceSimple(donneesStock, 'stock_available');
    const dependsOnStock = enEntier(getNumber(stockComplet?.depends_on_stock, 0), 0);
    const outOfStock = enEntier(getNumber(stockComplet?.out_of_stock, 2), 2);
    const location = nettoyerTexte(String(getValue(stockComplet?.location, '') || ''));

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <stock_available>
    <id>${idStock}</id>
    <id_product>${idProduit}</id_product>
    <id_product_attribute>${idAttr}</id_product_attribute>
    <id_shop>${rowShop}</id_shop>
    <id_shop_group>${rowShopGroup}</id_shop_group>
    <quantity>${enEntier(quantite, 0)}</quantity>
    <depends_on_stock>${dependsOnStock}</depends_on_stock>
    <out_of_stock>${outOfStock}</out_of_stock>
    <location>${location}</location>
  </stock_available>
</prestashop>`;

    await requeteApi(`stock_availables/${idStock}`, { methode: 'PUT', xml });
  }

  return enEntier(getNumber(stocksCibles[0]?.id, 0), 0);
};

// ─── Lecture aperçu CSV (export) ──────────────────────────────────────────────

export const lireApercuCsvFichier2 = (file, separateur = 'auto') =>
  lireApercuCsv(file, separateur, 10);

// ─── Import principal ─────────────────────────────────────────────────────────

export const importerFichier2AvecApi = async (file, mapping, onProgress, options = {}) => {
  // 1) Charger le CSV + fusionner la configuration runtime.
  const config = { ...CONFIG_FICHIER2, ...options };
  const { headers, rows, separateur } = await lireApercuCsv(file, config.separateur, 0);

  validerColonnesObligatoires({
    mapping,
    requiredFields: ['reference', 'specificite', 'karazany', 'stock_initial', 'prix_vente_ttc'],
    labelByField: {
      reference: 'reference',
      specificite: 'specificite',
      karazany: 'karazany',
      stock_initial: 'stock_initial',
      prix_vente_ttc: 'prix_vente_ttc',
    },
    fichier: 'fichier2',
  });

  // 2) Initialiser les caches pour eviter les appels API redondants.
  const cache = {
    groupesAttributs: new Map(),  // nom normalisé → id_attribute_group
    valeursAttributs: new Map(),  // "idGroupe__valeur" → id_attribute
    produits: new Map(),          // reference → { id, prixHt, idGroupeTaxe }
    tauxTaxes: new Map(),         // id_tax_rules_group → taux %
  };

  console.log('[fichier2] CSV parse', {
    separateurDetecte: separateur,
    totalHeaders: headers.length,
    totalLignes: rows.length,
  });
  console.log('[fichier2] tables utilisees', TABLES_FICHIER2);

  // 3) Retirer les lignes d'en-tete deja gerees par le mapping.
  const extra = Math.max(0, enEntier(config.lignesAIgnorer, 1) - 1);
  const lignes = rows.slice(extra);
  const total = lignes.length;
  let done = 0;
  let success = 0;
  let ignored = 0;
  const erreurs = [];
  const warnings = [];

  const notifier = (status) => {
    let percent = 100;
    if (total > 0) {
      percent = Math.round((done / total) * 100);
    } else {
      percent = 100;
    }
    if (typeof onProgress === 'function') onProgress({ done, total, percent, status });
  };

  for (const cellules of lignes) {
    // 4) Construire l'objet metier de la ligne CSV.
    const ligne = construireLigne(headers, cellules, mapping);
    const { reference, specificite, karazany, stock_initial, prix_vente_ttc } = ligne;

    done += 1;

    // Ligne vide ou sans référence → on ignore
    if (!reference) {
      ignored += 1;
      warnings.push(`Ligne ${done}: reference manquante, ignoree`);
      notifier(`Ligne ${done}/${total}: ignoree (pas de reference)`);
      continue;
    }

    try {
      notifier(`Ligne ${done}/${total}: traitement reference ${reference}`);

      if (prix_vente_ttc !== '' && prix_vente_ttc !== undefined) {
        validerMontantPositif(prix_vente_ttc, {
          champ: 'prix_vente_ttc',
          ligne: done,
          obligatoire: false,
        });
      }

      // 5) Rechercher le produit par reference.
      let produitInfo = cache.produits.get(reference);
      if (!produitInfo) {
        produitInfo = await trouverProduitParReference(reference);
        if (!produitInfo || !produitInfo.id) {
          ignored += 1;
          warnings.push(`Ligne ${done}: produit "${reference}" introuvable dans PrestaShop, ignore`);
          notifier(`Ligne ${done}/${total}: produit "${reference}" introuvable`);
          continue;
        }
        cache.produits.set(reference, produitInfo);
      }
      const { id: idProduit, prixHt: prixHtBase, idGroupeTaxe } = produitInfo;

      // 6A) Sans declinaison: mise a jour du stock du produit de base.
      if (!specificite && !karazany) {
        const quantite = enEntier(stock_initial, 0);

        // Mise à jour du stock du produit de base (id_product_attribute = 0)
        const idStockMaj = await mettreAJourStockApi(idProduit, 0, quantite, config);
        if (!idStockMaj) {
          ignored += 1;
          warnings.push(`Ligne ${done}: stock non mis a jour pour ${reference} (stock_available introuvable)`);
          notifier(`Ligne ${done}/${total}: stock non mis a jour pour ${reference}`);
          continue;
        }

        console.log('[fichier2] stock produit de base mis a jour', {
          reference,
          id_product: idProduit,
          quantity: quantite,
        });

        success += 1;
        notifier(`Ligne ${done}/${total}: stock mis a jour pour ${reference}`);
        continue;
      }

      // 6B) Avec declinaison: groupe attribut + valeur attribut + combinaison.

      // 6B.1) Groupe attribut (product_option).
      const idGroupe = await obtenirOuCreerGroupeAttribut(specificite, config, cache);

      // 6B.2) Valeur attribut (product_option_value).
      const idValeur = await obtenirOuCreerValeurAttribut(idGroupe, karazany, config, cache);

      // 6B.3) Calculer le delta prix de la combinaison (prix combinaison HT - prix produit HT).
      let deltaPrix = 0;
      if (prix_vente_ttc) {
        // On a besoin du taux de taxe pour convertir TTC → HT
        let tauxTaxe = cache.tauxTaxes.get(idGroupeTaxe);
        if (tauxTaxe === undefined) {
          tauxTaxe = await obtenirTauxTaxeDepuisGroupe(idGroupeTaxe);
          cache.tauxTaxes.set(idGroupeTaxe, tauxTaxe);
        }
        const prixTtcCombi = enNombre(prix_vente_ttc, 0);
        let prixHtCombi = prixTtcCombi;
        if (tauxTaxe > 0) {
          prixHtCombi = prixTtcCombi / (1 + tauxTaxe / 100);
        } else {
          prixHtCombi = prixTtcCombi;
        }
        deltaPrix = prixHtCombi - prixHtBase;
      }

      // 6B.4) Creer la declinaison si elle n'existe pas deja.
      const referenceDeclinaison = construireReferenceDeclinaison(reference, specificite, karazany);
      let idCombi = await trouverDeclinaison(idProduit, referenceDeclinaison);
      if (idCombi) {
        console.log('[fichier2] declinaison existante reutilisee', {
          reference,
          specificite,
          karazany,
          reference_combination: referenceDeclinaison,
          id_combination: idCombi,
        });
      } else {
        idCombi = await creerDeclinaisonApi(idProduit, idValeur, deltaPrix, referenceDeclinaison);
      }

      // 6B.5) Mettre a jour le stock de la declinaison.
      const quantite = enEntier(stock_initial, 0);
      const idStockMaj = await mettreAJourStockApi(idProduit, idCombi, quantite, config);
      if (!idStockMaj) {
        ignored += 1;
        warnings.push(
          `Ligne ${done}: declinaison creee/retrouvee mais stock non mis a jour pour ${reference} / ${karazany}`
        );
        notifier(`Ligne ${done}/${total}: stock declinaison non mis a jour pour ${reference}`);
        continue;
      }

      console.log('[fichier2] declinaison traitee', {
        reference,
        specificite,
        karazany,
        id_product: idProduit,
        id_combination: idCombi,
        stock: quantite,
        delta_prix: deltaPrix.toFixed(6),
      });

      success += 1;
      notifier(`Ligne ${done}/${total}: declinaison creee pour ${reference} / ${karazany}`);

    } catch (err) {
      erreurs.push(`Ligne ${done} (${reference}): ${err.message}`);
      console.error(`[fichier2] ERREUR ligne ${done}`, err);
      notifier(`Ligne ${done}/${total}: ERREUR - ${err.message}`);
    }
  }

  notifier('Import termine');
  return {
    doneCount: done,
    totalCount: total,
    successCount: success,
    ignoredCount: ignored,
    erreurs,
    warnings,
  };
};
