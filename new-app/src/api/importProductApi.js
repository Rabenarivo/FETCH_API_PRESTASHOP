/**
 * importApi.js
 *
 * Version simple pour debutant:
 * - noms de fonctions en francais
 * - flux clair par etapes
 * - commentaires courts et utiles
 */

import { parsePrestaXML, getCollection, getErrorMessage, getValue } from '../config/parserXML';

const URL_API =
  process.env.NODE_ENV === 'production'
    ? process.env.REACT_APP_PRESTASHOP_API_URL
    : '/evals/api';

// Configuration par defaut utilisee par tout le flux d'import.

export const CONFIG_IMPORT = {
  idLangue: 1,
  idBoutique: 1,
  separateur: ';',
  separateurMultiple: ',',
  lignesAIgnorer: 1,
};

export const PRESTA_FIELDS = [
  { value: '', label: 'Ignorer cette colonne' },
  { value: 'id', label: 'ID' },
  { value: 'active', label: 'Actif (0/1)' },
  { value: 'name', label: 'Nom' },
  { value: 'category', label: 'CatÃ©gories (x,y,z...)' },
  { value: 'price_tex', label: 'Prix HT' },
  { value: 'price_tin', label: 'Prix TTC' },
  { value: 'id_tax_rules_group', label: 'ID rÃ¨gle de taxes' },
  { value: 'wholesale_price', label: "Prix d'achat" },
  { value: 'on_sale', label: 'En soldes (0/1)' },
  { value: 'reduction_price', label: 'Montant de la remise' },
  { value: 'reduction_percent', label: 'Pourcentage de rÃ©duction' },
  { value: 'reduction_from', label: 'RÃ©duction de (AAAA-MM-JJ)' },
  { value: 'reduction_to', label: 'RÃ©duction Ã  (AAAA-MM-JJ)' },
  { value: 'reference', label: 'RÃ©fÃ©rence' },
  { value: 'supplier_reference', label: 'RÃ©fÃ©rence fournisseur' },
  { value: 'supplier', label: 'Fournisseurs' },
  { value: 'manufacturer', label: 'Marque' },
  { value: 'ean13', label: 'EAN-13' },
  { value: 'upc', label: 'UPC' },
  { value: 'mpn', label: 'MPN' },
  { value: 'ecotax', label: 'Ã‰co-participation' },
  { value: 'width', label: 'Largeur' },
  { value: 'height', label: 'Hauteur' },
  { value: 'depth', label: 'Profondeur' },
  { value: 'weight', label: 'Poids' },
  { value: 'delivery_in_stock', label: 'DÃ©lai livraison produits en stock' },
  { value: 'delivery_out_stock', label: 'DÃ©lai livraison produits Ã©puisÃ©s' },
  { value: 'quantity', label: 'QuantitÃ©' },
  { value: 'minimal_quantity', label: 'QuantitÃ© minimale' },
  { value: 'low_stock_threshold', label: 'Niveau de stock bas' },
  { value: 'low_stock_alert', label: 'Alerte stock bas par e-mail' },
  { value: 'visibility', label: 'VisibilitÃ©' },
  { value: 'additional_shipping_cost', label: 'Frais de port supplÃ©mentaire' },
  { value: 'unity', label: 'UnitÃ© pour le prix unitaire' },
  { value: 'unit_price', label: 'Prix unitaire' },
  { value: 'description_short', label: 'RÃ©sumÃ©' },
  { value: 'description', label: 'Description' },
  { value: 'tags', label: 'Mot-clÃ©s (x,y,z...)' },
  { value: 'meta_title', label: 'Balise titre' },
  { value: 'meta_keywords', label: 'Meta mots-clÃ©s' },
  { value: 'meta_description', label: 'Meta description' },
  { value: 'link_rewrite', label: 'URL rÃ©Ã©crite' },
  { value: 'available_now', label: 'LibellÃ© si en stock' },
  { value: 'available_later', label: 'LibellÃ© quand prÃ©commande activÃ©e' },
  { value: 'available_for_order', label: 'Disponible Ã  la commande (0/1)' },
  { value: 'available_date', label: 'Date de disponibilitÃ© du produit' },
  { value: 'date_add', label: "Date d'ajout du produit" },
  { value: 'show_price', label: 'Afficher le prix (0/1)' },
  { value: 'image', label: 'URL des images (x,y,z...)' },
  { value: 'image_alt', label: 'Textes alternatifs des images' },
  { value: 'delete_existing_images', label: 'Supprimer les images existantes (0/1)' },
  { value: 'feature', label: 'CaractÃ©ristique (Nom:Valeur:Position:PersonnalisÃ©)' },
  { value: 'online_only', label: 'Disponible en ligne uniquement (0/1)' },
  { value: 'condition', label: 'Ã‰tat' },
  { value: 'customizable', label: 'Personnalisable (0/1)' },
  { value: 'uploadable_files', label: 'Fichiers tÃ©lÃ©chargeables (0/1)' },
  { value: 'text_fields', label: 'Champs texte (0/1)' },
  { value: 'out_of_stock', label: 'Action en cas de rupture de stock' },
  { value: 'is_virtual', label: 'Produit dÃ©matÃ©rialisÃ© (0/1)' },
  { value: 'file_url', label: 'URL du fichier' },
  { value: 'nb_downloadable', label: 'Nombre de tÃ©lÃ©chargements autorisÃ©s' },
  { value: 'date_expiration', label: "Date d'expiration (aaaa-mm-jj)" },
  { value: 'nb_days_accessible', label: 'Nombre de jours' },
  { value: 'shop', label: 'ID / Nom de la boutique' },
  { value: 'advanced_stock_management', label: 'Gestion des stocks avancÃ©e' },
  { value: 'depends_on_stock', label: 'En fonction du stock' },
  { value: 'warehouse', label: 'EntrepÃ´t' },
  { value: 'accessories', label: 'Accessoires (x,y,z...)' },
];

const separerListe = (valeur, separateur = ',') =>
  (valeur || '')
    .split(separateur)
    .map((v) => v.trim())
    .filter(Boolean);

// Convertit une valeur CSV vers nombre decimal (supporte 17,95 et 17.95).
const enNombre = (valeur, defaut = 0) => {
  const normalisee = String(valeur ?? '').replace(',', '.');
  const n = parseFloat(normalisee);
  return Number.isNaN(n) ? defaut : n;
};

// Convertit une valeur CSV en entier avec valeur par defaut.
const enEntier = (valeur, defaut = 0) => {
  const n = parseInt(valeur, 10);
  return Number.isNaN(n) ? defaut : n;
};

// Harmonise les booleens en format PrestaShop (0/1).
const enOuiNon = (valeur, defaut = '0') => {
  if (valeur === '' || valeur === null || valeur === undefined) return defaut;
  const v = String(valeur).toLowerCase();
  return ['1', 'true', 'oui', 'yes'].includes(v) ? '1' : '0';
};

// Protege les caracteres speciaux avant insertion dans le XML.
const echapperXml = (texte = '') =>
  String(texte)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const slug = (texte) =>
  (texte || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'produit';

const normaliserTexte = (texte = '') =>
  String(texte)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\*/g, '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Dictionnaire des en-tetes CSV (anglais SQL export) -> champs internes Presta.
const ENTETES_SQL_VERS_CHAMP = {
  'product id': 'id',
  'active': 'active',
  'name': 'name',
  categories: 'category',
  'id category': 'category',
  'price tax excluded': 'price_tex',
  price: 'price_tex',
  'tax rules id': 'id_tax_rules_group',
  'wholesale price': 'wholesale_price',
  'on sale': 'on_sale',
  'discount amount': 'reduction_price',
  'discount percent': 'reduction_percent',
  'discount from': 'reduction_from',
  'discount to': 'reduction_to',
  reference: 'reference',
  'supplier reference': 'supplier_reference',
  supplier: 'supplier',
  manufacturer: 'manufacturer',
  ean13: 'ean13',
  upc: 'upc',
  ecotax: 'ecotax',
  width: 'width',
  height: 'height',
  depth: 'depth',
  weight: 'weight',
  'delivery time of in stock products': 'delivery_in_stock',
  'delivery time of out of stock products with allowed orders': 'delivery_out_stock',
  quantity: 'quantity',
  'minimal quantity': 'minimal_quantity',
  'low stock level': 'low_stock_threshold',
  'receive a low stock alert by email': 'low_stock_alert',
  visibility: 'visibility',
  'additional shipping cost': 'additional_shipping_cost',
  unity: 'unity',
  'unit price': 'unit_price',
  summary: 'description_short',
  'description short': 'description_short',
  description: 'description',
  tags: 'tags',
  'meta title': 'meta_title',
  'meta keywords': 'meta_keywords',
  'meta description': 'meta_description',
  'url rewritten': 'link_rewrite',
  'text when in stock': 'available_now',
  'text when backorder allowed': 'available_later',
  'available for order': 'available_for_order',
  'product available date': 'available_date',
  'product creation date': 'date_add',
  'show price': 'show_price',
  'image urls': 'image',
  'image alt texts': 'image_alt',
  'delete existing images': 'delete_existing_images',
  feature: 'feature',
  'available online only': 'online_only',
  condition: 'condition',
  customizable: 'customizable',
  'uploadable files': 'uploadable_files',
  'text fields': 'text_fields',
  'out of stock action': 'out_of_stock',
  'virtual product': 'is_virtual',
  'file url': 'file_url',
  'number of allowed downloads': 'nb_downloadable',
  'expiration date': 'date_expiration',
  'number of days': 'nb_days_accessible',
  'id name of shop': 'shop',
  'advanced stock management': 'advanced_stock_management',
  'depends on stock': 'depends_on_stock',
  warehouse: 'warehouse',
  accessories: 'accessories',
  acessories: 'accessories',
};

// Point unique pour tous les appels API (GET/POST/PUT).
const requeteApi = async (chemin, options = {}) => {
  const { methode = 'GET', xml = null, formData = null } = options;
  const init = { method: methode, credentials: 'include', headers: {} };

  if (xml !== null) {
    init.headers['Content-Type'] = 'application/xml';
    init.body = xml;
  }
  if (formData !== null) {
    init.body = formData;
  }

  const reponse = await fetch(`${URL_API}/${chemin}`, init);
  const texte = await reponse.text();
  const donnees = texte ? parsePrestaXML(texte) : null;

  if (!reponse.ok) {
    const messageApi = donnees ? getErrorMessage(donnees) : '';
    throw new Error(`HTTP ${reponse.status} ${methode} /${chemin}${messageApi ? ` - ${messageApi}` : ''}`);
  }

  return { reponse, texte, donnees };
};

const apiManquanteOuInterdite = (erreur) => /HTTP\s(404|405|501)/i.test(erreur?.message || '');

// Lit un noeud simple dans la reponse XML parsee.
const lireRessourceSimple = (donnees, nom) => {
  const noeud = donnees?.prestashop?.[nom];
  if (Array.isArray(noeud)) return noeud[0] || null;
  return noeud || null;
};

const nettoyerNoeudPourPut = (valeur) => {
  if (Array.isArray(valeur)) return valeur.map(nettoyerNoeudPourPut);
  if (!valeur || typeof valeur !== 'object') return valeur;

  const propre = {};
  Object.entries(valeur).forEach(([cle, v]) => {
    if (cle === 'xlink:href' || cle === 'href') return;
    propre[cle] = nettoyerNoeudPourPut(v);
  });
  return propre;
};

// Transforme une ligne CSV (tableau) en objet metier selon le mapping choisi.
const construireLigne = (entetes, ligne, mapping) => {
  const objet = {};
  entetes.forEach((_, i) => {
    const champ = mapping[i];
    if (!champ) return;
    objet[champ] = (ligne[i] || '').trim();
  });
  return objet;
};

// Recherche un ID par nom via l'API (categorie, marque, fournisseur, etc.).
const trouverIdParNom = async (ressource, nom) => {
  if (!nom) return null;
  if (/^\d+$/.test(nom)) return enEntier(nom, null);

  const filtre = encodeURIComponent(nom);
  const { donnees } = await requeteApi(`${ressource}?filter[name]=[${filtre}]&display=[id]`);

  const singulier = ressource.endsWith('ies')
    ? `${ressource.slice(0, -3)}y`
    : ressource.endsWith('s')
      ? ressource.slice(0, -1)
      : ressource;

  const liste = getCollection(donnees, singulier);
  if (!liste.length) return null;
  return enEntier(getValue(liste[0].id, '0'), null);
};

// Charge une ressource, la modifie via callback, puis l'envoie en PUT.
const mettreAJourRessource = async (ressourcePluriel, ressourceSingulier, id, modifier) => {
  const { donnees } = await requeteApi(`${ressourcePluriel}/${id}`);
  const source = lireRessourceSimple(donnees, ressourceSingulier);
  if (!source) throw new Error(`Ressource introuvable: ${ressourcePluriel}/${id}`);

  const copie = nettoyerNoeudPourPut(source);
  modifier(copie);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<prestashop>${objetVersXml(ressourceSingulier, copie)}</prestashop>`;
  await requeteApi(`${ressourcePluriel}/${id}`, { methode: 'PUT', xml });
};

// Conversion objet JS -> XML basique pour les appels PUT.
const objetVersXml = (racine, objet) => {
  const convertir = (valeur, nomBalise) => {
    if (nomBalise === '#text') {
      return echapperXml(valeur ?? '');
    }

    if (Array.isArray(valeur)) {
      return valeur.map((v) => convertir(v, nomBalise)).join('');
    }
    if (valeur && typeof valeur === 'object') {
      const contenu = Object.entries(valeur)
        .map(([k, v]) => convertir(v, k))
        .join('');
      return `<${nomBalise}>${contenu}</${nomBalise}>`;
    }
    return `<${nomBalise}>${echapperXml(valeur ?? '')}</${nomBalise}>`;
  };

  return convertir(objet, racine);
};

// Convertit les categories CSV en IDs PrestaShop.
const lireIdsCategories = async (categoriesTexte, separateurMultiple) => {
  const noms = separerListe(categoriesTexte, separateurMultiple);
  const ids = [];

  for (const nom of noms) {
    const id = await trouverIdParNom('categories', nom);
    if (id) ids.push(id);
  }

  return [...new Set(ids)];
};

// Etape 1 obligatoire: creation du produit.
const creerProduitApi = async (ligne, config, idsCategories) => {
  const nom = ligne.name || '';
  const idCategorieDefaut = idsCategories[0] || 2;
  const idMarque = ligne.manufacturer ? await trouverIdParNom('manufacturers', ligne.manufacturer) : null;

  const categoriesXml = idsCategories.map((id) => `<category><id>${id}</id></category>`).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <product>
    <id_category_default>${idCategorieDefaut}</id_category_default>
    <id_tax_rules_group>${enEntier(ligne.id_tax_rules_group, 0)}</id_tax_rules_group>
    <id_manufacturer>${idMarque || 0}</id_manufacturer>
    <reference>${echapperXml(ligne.reference || '')}</reference>
    <supplier_reference>${echapperXml(ligne.supplier_reference || '')}</supplier_reference>
    <ean13>${echapperXml(ligne.ean13 || '')}</ean13>
    <upc>${echapperXml(ligne.upc || '')}</upc>
    <ecotax>${enNombre(ligne.ecotax, 0)}</ecotax>
    <width>${enNombre(ligne.width, 0)}</width>
    <height>${enNombre(ligne.height, 0)}</height>
    <depth>${enNombre(ligne.depth, 0)}</depth>
    <weight>${enNombre(ligne.weight, 0)}</weight>
    <price>${enNombre(ligne.price_tex, 0)}</price>
    <wholesale_price>${enNombre(ligne.wholesale_price, 0)}</wholesale_price>
    <minimal_quantity>${enEntier(ligne.minimal_quantity, 1)}</minimal_quantity>
    <low_stock_threshold>${ligne.low_stock_threshold === '' ? '' : enEntier(ligne.low_stock_threshold, 0)}</low_stock_threshold>
    <low_stock_alert>${enOuiNon(ligne.low_stock_alert, '0')}</low_stock_alert>
    <active>${enOuiNon(ligne.active, '1')}</active>
    <on_sale>${enOuiNon(ligne.on_sale, '0')}</on_sale>
    <available_for_order>${enOuiNon(ligne.available_for_order, '1')}</available_for_order>
    <show_price>${enOuiNon(ligne.show_price, '1')}</show_price>
    <online_only>${enOuiNon(ligne.online_only, '0')}</online_only>
    <condition>${echapperXml(ligne.condition || 'new')}</condition>
    <customizable>${enEntier(ligne.customizable, 0)}</customizable>
    <uploadable_files>${enEntier(ligne.uploadable_files, 0)}</uploadable_files>
    <text_fields>${enEntier(ligne.text_fields, 0)}</text_fields>
    <additional_shipping_cost>${enNombre(ligne.additional_shipping_cost, 0)}</additional_shipping_cost>
    <unity>${echapperXml(ligne.unity || '')}</unity>
    <unit_price>${enNombre(ligne.unit_price, 0)}</unit_price>
    <visibility>${echapperXml(ligne.visibility || 'both')}</visibility>
    <available_date>${echapperXml(ligne.available_date || '')}</available_date>
    <is_virtual>${enOuiNon(ligne.is_virtual, '0')}</is_virtual>
    <name><language id="${config.idLangue}">${echapperXml(nom)}</language></name>
    <description_short><language id="${config.idLangue}">${echapperXml(ligne.description_short || '')}</language></description_short>
    <description><language id="${config.idLangue}">${echapperXml(ligne.description || '')}</language></description>
    <meta_title><language id="${config.idLangue}">${echapperXml(ligne.meta_title || '')}</language></meta_title>
    <meta_keywords><language id="${config.idLangue}">${echapperXml(ligne.meta_keywords || '')}</language></meta_keywords>
    <meta_description><language id="${config.idLangue}">${echapperXml(ligne.meta_description || '')}</language></meta_description>
    <link_rewrite><language id="${config.idLangue}">${echapperXml(ligne.link_rewrite || slug(nom))}</language></link_rewrite>
    <available_now><language id="${config.idLangue}">${echapperXml(ligne.available_now || '')}</language></available_now>
    <available_later><language id="${config.idLangue}">${echapperXml(ligne.available_later || '')}</language></available_later>
    <delivery_in_stock><language id="${config.idLangue}">${echapperXml(ligne.delivery_in_stock || '')}</language></delivery_in_stock>
    <delivery_out_stock><language id="${config.idLangue}">${echapperXml(ligne.delivery_out_stock || '')}</language></delivery_out_stock>
    <associations>
      <categories>${categoriesXml}</categories>
    </associations>
  </product>
</prestashop>`;

  const { donnees } = await requeteApi('products', { methode: 'POST', xml });
  const produit = lireRessourceSimple(donnees, 'product');
  const idProduit = enEntier(getValue(produit?.id, '0'), 0);

  if (!idProduit) throw new Error('Impossible de rÃ©cupÃ©rer id_product aprÃ¨s crÃ©ation');
  return idProduit;
};

// Etape 2 obligatoire: mise a jour des associations categories.
const mettreAJourCategoriesProduit = async (idProduit, idsCategories) => {
  if (!idsCategories.length) return;

  await mettreAJourRessource('products', 'product', idProduit, (produit) => {
    produit.associations = produit.associations || {};
    produit.associations.categories = {
      category: idsCategories.map((id) => ({ id: String(id) })),
    };
  });
};

// Recupere la ligne de stock de base (id_product_attribute = 0).
const trouverIdStockDisponible = async (idProduit) => {
  const { donnees } = await requeteApi(
    `stock_availables?filter[id_product]=[${idProduit}]&filter[id_product_attribute]=[0]&display=[id]`
  );
  const stocks = getCollection(donnees, 'stock_available');
  if (!stocks.length) return null;
  return enEntier(getValue(stocks[0].id, '0'), null);
};

// Etape 3 obligatoire: mise a jour du stock.
const mettreAJourStockProduit = async (idProduit, ligne, config) => {
  const idStock = await trouverIdStockDisponible(idProduit);
  if (!idStock) throw new Error(`Aucun stock_available trouvÃ© pour le produit ${idProduit}`);

  await mettreAJourRessource('stock_availables', 'stock_available', idStock, (stock) => {
    stock.id_product = String(idProduit);
    stock.id_product_attribute = '0';
    stock.id_shop = String(config.idBoutique);
    stock.quantity = String(enEntier(ligne.quantity, 0));
    stock.out_of_stock = String(enEntier(ligne.out_of_stock, 0));
    stock.depends_on_stock = enOuiNon(ligne.depends_on_stock, '0');
  });
};

// Etape optionnelle: cree un prix specifique si remise presente.
const creerPrixSpecifique = async (idProduit, ligne, config) => {
  const aMontant = ligne.reduction_price !== '' && ligne.reduction_price !== undefined;
  const aPourcent = ligne.reduction_percent !== '' && ligne.reduction_percent !== undefined;
  if (!aMontant && !aPourcent) return;

  const typeReduction = aPourcent ? 'percentage' : 'amount';
  const reduction = aPourcent ? enNombre(ligne.reduction_percent, 0) / 100 : enNombre(ligne.reduction_price, 0);
  const dateDebut = ligne.reduction_from ? `${ligne.reduction_from} 00:00:00` : '0000-00-00 00:00:00';
  const dateFin = ligne.reduction_to ? `${ligne.reduction_to} 23:59:59` : '0000-00-00 00:00:00';

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <specific_price>
    <id_product>${idProduit}</id_product>
    <id_shop>${config.idBoutique}</id_shop>
    <id_currency>0</id_currency>
    <id_country>0</id_country>
    <id_group>0</id_group>
    <id_customer>0</id_customer>
    <id_product_attribute>0</id_product_attribute>
    <price>-1</price>
    <from_quantity>1</from_quantity>
    <reduction>${reduction}</reduction>
    <reduction_type>${typeReduction}</reduction_type>
    <from>${dateDebut}</from>
    <to>${dateFin}</to>
  </specific_price>
</prestashop>`;

  await requeteApi('specific_prices', { methode: 'POST', xml });
};

// Etape optionnelle: cree les tags trouves dans la ligne CSV.
const creerTagsProduit = async (ligne, config) => {
  const tags = separerListe(ligne.tags, ',');
  if (!tags.length) return;

  for (const tag of tags) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <tag>
    <id_lang>${config.idLangue}</id_lang>
    <name>${echapperXml(tag)}</name>
  </tag>
</prestashop>`;
    await requeteApi('tags', { methode: 'POST', xml });
  }
};

// Etape optionnelle: lie le produit a son fournisseur.
const creerLienFournisseurProduit = async (idProduit, ligne) => {
  if (!ligne.supplier && !ligne.supplier_reference) return;
  const idFournisseur = await trouverIdParNom('suppliers', ligne.supplier || '');
  if (!idFournisseur) return;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <product_supplier>
    <id_product>${idProduit}</id_product>
    <id_product_attribute>0</id_product_attribute>
    <id_supplier>${idFournisseur}</id_supplier>
    <product_supplier_reference>${echapperXml(ligne.supplier_reference || '')}</product_supplier_reference>
    <product_supplier_price_te>0</product_supplier_price_te>
    <id_currency>0</id_currency>
  </product_supplier>
</prestashop>`;

  await requeteApi('product_suppliers', { methode: 'POST', xml });
};

// Etape optionnelle: telecharge les images depuis URL puis upload vers PrestaShop.
const envoyerImagesProduit = async (idProduit, ligne) => {
  const urls = separerListe(ligne.image, ',');
  if (!urls.length) return;

  for (let i = 0; i < urls.length; i += 1) {
    const url = urls[i];
    const reponseImage = await fetch(url);
    if (!reponseImage.ok) throw new Error(`Image non accessible (${reponseImage.status}) : ${url}`);

    const blob = await reponseImage.blob();
    const formulaire = new FormData();
    formulaire.append('image', blob, `produit-${idProduit}-${i + 1}.jpg`);

    await requeteApi(`images/products/${idProduit}`, { methode: 'POST', formData: formulaire });
  }
};

// Etape optionnelle: ajoute les caracteristiques (feature:value).
const ajouterCaracteristiquesProduit = async (idProduit, ligne) => {
  const morceaux = separerListe(ligne.feature, ',');
  if (!morceaux.length) return;

  const associations = [];

  for (const morceau of morceaux) {
    const [nomCarac, valeurCarac] = morceau.split(':').map((v) => (v || '').trim());
    if (!nomCarac || !valeurCarac) continue;

    const idCarac = await trouverIdParNom('product_features', nomCarac);
    if (!idCarac) continue;

    const xmlValeur = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <product_feature_value>
    <id_feature>${idCarac}</id_feature>
    <custom>0</custom>
    <value><language id="1">${echapperXml(valeurCarac)}</language></value>
  </product_feature_value>
</prestashop>`;

    const { donnees } = await requeteApi('product_feature_values', { methode: 'POST', xml: xmlValeur });
    const valeur = lireRessourceSimple(donnees, 'product_feature_value');
    const idValeur = enEntier(getValue(valeur?.id, '0'), 0);
    if (!idValeur) continue;

    associations.push({ id: String(idCarac), id_feature_value: String(idValeur) });
  }

  if (!associations.length) return;

  await mettreAJourRessource('products', 'product', idProduit, (produit) => {
    produit.associations = produit.associations || {};
    produit.associations.product_features = { product_feature: associations };
  });
};

/**
 * Lit un CSV et retourne les en-tetes + apercu de lignes.
 */
export const lireApercuCsv = (file, separateur = ';', maxRows = 0) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const lignes = e.target.result
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      const entetes = (lignes[0] || '').split(separateur).map((h) => h.trim());
      const lignesData = lignes.slice(1);
      const lignesApercu = (maxRows > 0 ? lignesData.slice(0, maxRows) : lignesData)
        .map((ligne) => ligne.split(separateur).map((cellule) => cellule.trim()));

      resolve({ headers: entetes, rows: lignesApercu });
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });

/** @deprecated */
export const parseCsvPreview = lireApercuCsv;

/**
 * DÃ©tection automatique simple du mapping (header CSV -> champ Prestashop).
 */
export const detecterMappingAutomatique = (headers) =>
  headers.map((header) => {
    const h = normaliserTexte(header);

    // Priorite aux en-tetes venant d'un export SQL standard.
    if (ENTETES_SQL_VERS_CHAMP[h]) {
      return ENTETES_SQL_VERS_CHAMP[h];
    }

    const match = PRESTA_FIELDS.find(
      (f) => f.value && (normaliserTexte(f.value) === h || normaliserTexte(f.label) === h)
    );
    return match ? match.value : '';
  });

/** @deprecated */
export const autoDetectMapping = detecterMappingAutomatique;

/**
 * Import principal avec flux demandÃ©:
 * 1) POST products (obligatoire)
 * 2) PUT products/{id} categories (obligatoire)
 * 3) PUT stock_availables/{id} (obligatoire)
 * 4-8) APIs optionnelles
 * 9-11) pas d'API -> ignorÃ©
 */
export const importerProduitsAvecApi = async (file, mapping, onProgress, options = {}) => {
  const config = { ...CONFIG_IMPORT, ...options };
  const { headers, rows } = await lireApercuCsv(file, config.separateur, 0);

  const extra = Math.max(0, enEntier(config.lignesAIgnorer, 1) - 1);
  const lignes = rows.slice(extra);
  const total = lignes.length;

  let done = 0;
  const erreurs = [];
  const warnings = [];

  const notifier = (status) => {
    const percent = total > 0 ? Math.round((done / total) * 100) : 100;
    onProgress({ done, total, percent, status });
  };

  for (let i = 0; i < lignes.length; i += 1) {
    const numeroLigne = i + 1 + config.lignesAIgnorer;
    const ligne = construireLigne(headers, lignes[i], mapping);

    try {
      if (!ligne.name) throw new Error('Nom du produit manquant');

      // 1) POST /products
      notifier('creation-produit');
      const idsCategoriesLus = await lireIdsCategories(ligne.category, config.separateurMultiple);
      const idsCategories = idsCategoriesLus.length ? idsCategoriesLus : [2];
      const idProduit = await creerProduitApi(ligne, config, idsCategories);

      // 2) PUT /products/{id} pour les categories
      notifier('maj-categories');
      await mettreAJourCategoriesProduit(idProduit, idsCategories);

      // 3) PUT /stock_availables/{id}
      notifier('maj-stock');
      await mettreAJourStockProduit(idProduit, ligne, config);

      // 4-8) APIs optionnelles (les erreurs optionnelles sont non bloquantes)
      notifier('etapes-optionnelles');
      const etapesOptionnelles = [
        () => creerPrixSpecifique(idProduit, ligne, config),
        () => creerTagsProduit(ligne, config),
        () => creerLienFournisseurProduit(idProduit, ligne),
        () => envoyerImagesProduit(idProduit, ligne),
        () => ajouterCaracteristiquesProduit(idProduit, ligne),
      ];

      for (const etape of etapesOptionnelles) {
        try {
          await etape();
        } catch (erreurOptionnelle) {
          if (apiManquanteOuInterdite(erreurOptionnelle)) {
            warnings.push(`Ligne ${numeroLigne}: API optionnelle absente -> ignorÃ©e`);
          } else {
            warnings.push(`Ligne ${numeroLigne}: Ã©tape optionnelle ignorÃ©e (${erreurOptionnelle.message})`);
          }
        }
      }

      done += 1;
      notifier('ligne-terminee');
    } catch (erreur) {
      erreurs.push(`Ligne ${numeroLigne}: ${erreur.message}`);
    }
  }

  if (erreurs.length) {
    throw Object.assign(new Error('Import terminÃ© avec erreurs'), {
      details: [...erreurs, ...warnings],
    });
  }

  notifier('termine');
  return {
    doneCount: done,
    totalCount: total,
    warnings,
  };
};

/** @deprecated */
export const runImport = importerProduitsAvecApi;
