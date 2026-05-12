import {
  parsePrestaXML,
  getCollection,
  getErrorMessage,
  getNumber,
  getLangValue,
  hasError,
} from '../config/parserXML';

let URL_API = '/evals/api';
if (process.env.NODE_ENV === 'production') {
  URL_API = process.env.REACT_APP_PRESTASHOP_API_URL;
} else {
  URL_API = '/evals/api';
}

export const CONFIG_FICHIER1 = {
  idLangue: 1,
  idBoutique: 1,
  idShopGroup: 1,
  idPaysTaxe: 0,
  idCategorieParentDefaut: 1,
  separateur: ';',
  lignesAIgnorer: 1,
};

// Ressources/tables manipulees par l'import fichier 1.
export const TABLES_FICHIER1 = [
  'categories',
  'taxes',
  'tax_rule_groups',
  'tax_rules',
  'products',
];

export const PRESTA_FIELDS_FICHIER1 = [
  { value: '', label: 'Ignorer cette colonne' },
  { value: 'date_produit', label: 'Date produit' },
  { value: 'nom', label: 'Nom' },
  { value: 'reference', label: 'Référence' },
  { value: 'prix_ttc', label: 'Prix TTC' },
  { value: 'Taxe', label: 'Taxe' },
  { value: 'categorie', label: 'Catégorie' },
  { value: 'prix_achat', label: "Prix d'achat" },
];

const ENTETES_VERS_CHAMP = {
  date_produit: 'date_produit',
  date: 'date_produit',
  nom: 'nom',
  name: 'nom',
  reference: 'reference',
  ref: 'reference',
  prix_ttc: 'prix_ttc',
  'prix ttc': 'prix_ttc',
  price_ttc: 'prix_ttc',
  taxe: 'taxe',
  tax: 'taxe',
  categorie: 'categorie',
  category: 'categorie',
  prix_achat: 'prix_achat',
  'prix achat': 'prix_achat',
  wholesale_price: 'prix_achat',
  wholesale: 'prix_achat',
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

const slug = (texte) =>
  (texte || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'categorie';

const cleCategorie = (nom = '') => normaliserTexte(nom);
const cleTaxe = (rate = 0) => Number(rate).toFixed(3);

const enEntier = (valeur, defaut = 0) => {
  const n = parseInt(valeur, 10);
  if (Number.isNaN(n)) {
    return defaut;
  } else {
    return n;
  }
};

const enNombre = (valeur, defaut = 0) => {
  const normalisee = String(valeur ?? '').replace(',', '.').replace(/\s/g, '');
  const n = parseFloat(normalisee);
  if (Number.isNaN(n)) {
    return defaut;
  } else {
    return n;
  }
};

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

const parserCsvSimple = (contenu, separateur = ';') => {
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

const dateMaintenant = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

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
    throw new Error(`HTTP ${reponse.status} ${methode} /${chemin}${suffixeErreur}`);
  }

  // Certaines reponses PrestaShop retournent HTTP 200 avec un bloc <errors> XML.
  if (donnees && hasError(donnees)) {
    const messageApi = getErrorMessage(donnees) || 'Erreur API PrestaShop';
    throw new Error(`${methode} /${chemin} - ${messageApi}`);
  }

  return { reponse, texte, donnees };
};

const lireRessourceSimple = (donnees, nom) => {
  const noeud = donnees?.prestashop?.[nom];
  if (Array.isArray(noeud)) return noeud[0] || null;
  return noeud || null;
};

const construireLigne = (entetes, ligne, mapping) => {
  const objet = {};
  entetes.forEach((_, index) => {
    const champ = mapping[index];
    if (!champ) return;
    objet[champ] = (ligne[index] || '').trim();
  });
  return objet;
};

const lireApercuCsv = (file, separateur = ';', maxRows = 0) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const contenu = String(event.target.result || '').replace(/^\uFEFF/, '');
      let separateurReel = separateur;
      if (separateur === 'auto') {
        separateurReel = detecterSeparateur(contenu);
      } else {
        separateurReel = separateur;
      }
      const parsed = parserCsvSimple(contenu, separateurReel);
      let lignesApercu = parsed.rows;
      if (maxRows > 0) {
        lignesApercu = parsed.rows.slice(0, maxRows);
      } else {
        lignesApercu = parsed.rows;
      }

      resolve({ headers: parsed.headers, rows: lignesApercu, separateur: separateurReel });
    };
    reader.onerror = reject;
    reader.readAsText(file, 'utf-8');
  });

export const detecterMappingFichier1 = (headers) =>
  headers.map((header) => {
    const h = normaliserTexte(header);
    if (ENTETES_VERS_CHAMP[h]) return ENTETES_VERS_CHAMP[h];

    const match = PRESTA_FIELDS_FICHIER1.find(
      (field) => field.value && (normaliserTexte(field.value) === h || normaliserTexte(field.label) === h)
    );

    if (match) {
      return match.value;
    } else {
      return '';
    }
  });

const trouverCollectionId = async (url, collectionName) => {
  const { donnees } = await requeteApi(url);
  const items = getCollection(donnees, collectionName);
  if (!items.length) return null;
  const id = getNumber(items[0]?.id, null);
  if (id === null) {
    return null;
  } else {
    return enEntier(id, null);
  }
};

const trouverCategorieParNom = async (nom) => {
  if (!nom) return null;
  if (/^\d+$/.test(String(nom))) return enEntier(nom, null);

  const filtre = encodeURIComponent(String(nom));
  const idParFiltre = await trouverCollectionId(`categories?filter[name]=[${filtre}]&display=[id]`, 'category');
  if (idParFiltre) return idParFiltre;

  // Fallback: certains webservices ne filtrent pas correctement les champs multilingues.
  const { donnees } = await requeteApi('categories?display=[id,name]&limit=200');
  const categories = getCollection(donnees, 'category');
  const cible = cleCategorie(nom);

  const trouvee = categories.find((cat) => cleCategorie(getLangValue(cat?.name, 1) || '') === cible);
  if (!trouvee) return null;
  return enEntier(getNumber(trouvee?.id, 0), null);
};

const creerCategorieApi = async (nom, config) => {
  console.log('[fichier1] POST categories', {
    table: 'ps_category / ps_category_lang',
    categorie: nom,
    id_parent: config.idCategorieParentDefaut,
    id_shop_default: config.idBoutique,
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <category>
    <id_parent>${config.idCategorieParentDefaut}</id_parent>
    <id_shop_default>${config.idBoutique}</id_shop_default>
    <active>1</active>
    <name><language id="${config.idLangue}">${nettoyerTexte(nom)}</language></name>
    <link_rewrite><language id="${config.idLangue}">${slug(nom)}</language></link_rewrite>
  </category>
</prestashop>`;

  const { donnees } = await requeteApi('categories', { methode: 'POST', xml });
  const categorie = lireRessourceSimple(donnees, 'category');
  const idCategorie = enEntier(getNumber(categorie?.id, 0), 0);
  if (!idCategorie) throw new Error('Impossible de recuperer id_category apres creation');
  return idCategorie;
};

const obtenirOuCreerCategorie = async (nom, config, cache) => {
  const cle = cleCategorie(nom);
  if (cache.categories.has(cle)) {
    return cache.categories.get(cle);
  }

  const idCategorie = await trouverCategorieParNom(nom);
  if (idCategorie) {
    console.log('[fichier1] categorie existante reutilisee', {
      table: 'ps_category / ps_category_lang',
      categorie: nom,
      id_category: idCategorie,
    });
    cache.categories.set(cle, idCategorie);
    return idCategorie;
  }

  const idCree = await creerCategorieApi(nom, config);
  cache.categories.set(cle, idCree);
  return idCree;
};

const trouverTaxeParRate = async (rate) => {
  const valeur = Number(rate).toFixed(3);
  const filtre = encodeURIComponent(valeur);
  const idParFiltre = await trouverCollectionId(`taxes?filter[rate]=[${filtre}]&display=[id]`, 'tax');
  if (idParFiltre) return idParFiltre;

  // Fallback robuste en cas de format de filtre non supporte selon la version PS.
  const { donnees } = await requeteApi('taxes?display=[id,rate]&limit=200');
  const taxes = getCollection(donnees, 'tax');
  const trouvee = taxes.find((tax) => cleTaxe(getNumber(tax?.rate, 0)) === valeur);
  if (!trouvee) return null;
  return enEntier(getNumber(trouvee?.id, 0), null);
};

const creerTaxeApi = async (rate, config) => {
  const nomTaxe = `TVA ${Number(rate).toFixed(3)}%`;
  console.log('[fichier1] POST taxes', {
    table: 'ps_tax / ps_tax_lang',
    rate: Number(rate).toFixed(3),
    name: nomTaxe,
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <tax>
    <rate>${Number(rate).toFixed(3)}</rate>
    <active>1</active>
    <deleted>0</deleted>
    <name><language id="${config.idLangue}">${nettoyerTexte(nomTaxe)}</language></name>
  </tax>
</prestashop>`;

  const { donnees } = await requeteApi('taxes', { methode: 'POST', xml });
  const taxe = lireRessourceSimple(donnees, 'tax');
  const idTaxe = enEntier(getNumber(taxe?.id, 0), 0);
  if (!idTaxe) throw new Error('Impossible de recuperer id_tax apres creation');
  return idTaxe;
};

const obtenirOuCreerTaxe = async (rate, config, cache) => {
  const cle = cleTaxe(rate);
  if (cache.taxes.has(cle)) {
    return cache.taxes.get(cle);
  }

  const idTaxe = await trouverTaxeParRate(rate);
  if (idTaxe) {
    console.log('[fichier1] taxe existante reutilisee', {
      table: 'ps_tax / ps_tax_lang',
      rate: cle,
      id_tax: idTaxe,
    });
    cache.taxes.set(cle, idTaxe);
    return idTaxe;
  }

  const idCree = await creerTaxeApi(rate, config);
  cache.taxes.set(cle, idCree);
  return idCree;
};

const trouverGroupeTaxeParNom = async (nom) => {
  const filtre = encodeURIComponent(String(nom));
  return trouverCollectionId(`tax_rule_groups?filter[name]=[${filtre}]&display=[id]`, 'tax_rule_group');
};

const creerGroupeTaxeApi = async (nom) => {
  const maintenant = dateMaintenant();
  console.log('[fichier1] POST tax_rule_groups', {
    table: 'ps_tax_rules_group',
    name: nom,
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <tax_rule_group>
    <name>${nettoyerTexte(nom)}</name>
    <active>1</active>
    <deleted>0</deleted>
    <date_add>${maintenant}</date_add>
    <date_upd>${maintenant}</date_upd>
  </tax_rule_group>
</prestashop>`;

  const { donnees } = await requeteApi('tax_rule_groups', { methode: 'POST', xml });
  const groupe = lireRessourceSimple(donnees, 'tax_rule_group');
  const idGroupe = enEntier(getNumber(groupe?.id, 0), 0);
  if (!idGroupe) throw new Error('Impossible de recuperer id_tax_rules_group apres creation');
  return idGroupe;
};

const obtenirOuCreerGroupeTaxe = async (nom, cache) => {
  if (cache.groupesTaxes.has(nom)) {
    return cache.groupesTaxes.get(nom);
  }

  const idGroupe = await trouverGroupeTaxeParNom(nom);
  if (idGroupe) {
    cache.groupesTaxes.set(nom, idGroupe);
    return idGroupe;
  }

  const idCree = await creerGroupeTaxeApi(nom);
  cache.groupesTaxes.set(nom, idCree);
  return idCree;
};

const creerRegleTaxeApi = async (idGroupe, idTaxe, config) => {
  if (!config.idPaysTaxe) return null;

  console.log('[fichier1] POST tax_rules', {
    table: 'ps_tax_rule',
    id_tax_rules_group: idGroupe,
    id_tax: idTaxe,
    id_country: config.idPaysTaxe,
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <tax_rule>
    <id_tax_rules_group>${idGroupe}</id_tax_rules_group>
    <id_state>0</id_state>
    <id_country>${config.idPaysTaxe}</id_country>
    <zipcode_from></zipcode_from>
    <zipcode_to></zipcode_to>
    <id_tax>${idTaxe}</id_tax>
    <behavior>0</behavior>
    <description>Import fichier 1</description>
  </tax_rule>
</prestashop>`;

  const { donnees } = await requeteApi('tax_rules', { methode: 'POST', xml });
  const regle = lireRessourceSimple(donnees, 'tax_rule');
  return enEntier(getNumber(regle?.id, 0), 0);
};

const trouverProduitParReference = async (reference) => {
  if (!reference) return null;
  const filtre = encodeURIComponent(String(reference));
  return trouverCollectionId(`products?filter[reference]=[${filtre}]&display=[id]`, 'product');
};

const creerProduitApi = async (ligne, config, idCategorie, idGroupeTaxe, prixHt) => {
  const nom = ligne.nom || '';
  const reference = ligne.reference || '';

  console.log('[fichier1] POST products', {
    table: 'ps_product / ps_product_lang / ps_product_shop',
    reference,
    nom,
    id_category_default: idCategorie,
    id_tax_rules_group: idGroupeTaxe,
    price_ht: prixHt,
    wholesale_price: enNombre(ligne.prix_achat, 0),
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <product>
    <id_category_default>${idCategorie}</id_category_default>
    <id_tax_rules_group>${idGroupeTaxe}</id_tax_rules_group>
    <id_shop_default>${config.idBoutique}</id_shop_default>
    <reference>${nettoyerTexte(reference)}</reference>
    <price>${prixHt.toFixed(6)}</price>
    <wholesale_price>${enNombre(ligne.prix_achat, 0).toFixed(6)}</wholesale_price>
    <active>1</active>
    <available_for_order>1</available_for_order>
    <show_price>1</show_price>
    <visibility>both</visibility>
    <condition>new</condition>
    <name><language id="${config.idLangue}">${nettoyerTexte(nom)}</language></name>
    <link_rewrite><language id="${config.idLangue}">${slug(nom)}</language></link_rewrite>
    <description><language id="${config.idLangue}"></language></description>
    <description_short><language id="${config.idLangue}"></language></description_short>
    <meta_title><language id="${config.idLangue}">${nettoyerTexte(nom)}</language></meta_title>
    <meta_keywords><language id="${config.idLangue}"></language></meta_keywords>
    <meta_description><language id="${config.idLangue}"></language></meta_description>
    <associations>
      <categories>
        <category><id>${idCategorie}</id></category>
      </categories>
    </associations>
  </product>
</prestashop>`;

  const { donnees } = await requeteApi('products', { methode: 'POST', xml });
  const produit = lireRessourceSimple(donnees, 'product');
  const idProduit = enEntier(getNumber(produit?.id, 0), 0);
  if (!idProduit) throw new Error('Impossible de recuperer id_product apres creation');
  return idProduit;
};

export const importerFichier1AvecApi = async (file, mapping, onProgress, options = {}) => {
  // 1) Charger le CSV + fusionner la configuration runtime.
  const config = { ...CONFIG_FICHIER1, ...options };
  const { headers, rows, separateur } = await lireApercuCsv(file, config.separateur, 0);

  // 2) Initialiser les caches pour eviter les requetes API repetitives.
  const cache = {
    categories: new Map(),
    taxes: new Map(),
    groupesTaxes: new Map(),
  };

  console.log('[fichier1] CSV parse', {
    separateurDetecte: separateur,
    lignesIgnorees: config.lignesAIgnorer,
    totalHeaders: headers.length,
  });
  console.log('[fichier1] tables utilisees', TABLES_FICHIER1);

  // 3) Retirer les lignes d'en-tete deja gerees par le mapping.
  const extra = Math.max(0, enEntier(config.lignesAIgnorer, 1) - 1);
  const lignes = rows.slice(extra);
  const total = lignes.length;

  let done = 0;
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

  for (let i = 0; i < lignes.length; i += 1) {
    const numeroLigne = i + 1 + config.lignesAIgnorer;
    const ligne = construireLigne(headers, lignes[i], mapping);

    try {
      // 4) Validation minimale de la ligne CSV.
      if (!ligne.reference) throw new Error('Reference manquante');
      if (!ligne.nom) throw new Error('Nom manquant');
      if (!ligne.categorie) throw new Error('Categorie manquante');
      if (ligne.prix_ttc === '' || ligne.prix_ttc === undefined) throw new Error('Prix TTC manquant');

      // 5) Categorie (recherche puis creation si necessaire).
      notifier('categorie');
      const idCategorie = await obtenirOuCreerCategorie(ligne.categorie, config, cache);

      // 6) Conversion TTC -> HT a partir de la taxe de la ligne.
      const taxeBrute = String(ligne.taxe || '').replace('%', '').trim();
      const tauxTaxe = enNombre(taxeBrute, 0);
      const prixTtc = enNombre(ligne.prix_ttc, 0);
      let prixHt = prixTtc;
      if (tauxTaxe > 0) {
        prixHt = prixTtc / (1 + tauxTaxe / 100);
      } else {
        prixHt = prixTtc;
      }

      let idGroupeTaxe = 0;
      if (tauxTaxe > 0) {
        notifier('taxe');
        const idTaxe = await obtenirOuCreerTaxe(tauxTaxe, config, cache);
        idGroupeTaxe = await obtenirOuCreerGroupeTaxe(`TVA ${Number(tauxTaxe).toFixed(3)}%`, cache);

        try {
          await creerRegleTaxeApi(idGroupeTaxe, idTaxe, config);
        } catch (erreurRegle) {
          warnings.push(`Ligne ${numeroLigne}: regle de taxe non creee (${erreurRegle.message})`);
        }
      }

      if (!idGroupeTaxe) {
        idGroupeTaxe = enEntier(config.idTaxeRulesGroupDefaut, 0);
      }

      // 7) Produit: ignorer si deja present, sinon creer.
      const idProduitExistant = await trouverProduitParReference(ligne.reference);

      if (idProduitExistant) {
        warnings.push(`Ligne ${numeroLigne}: reference ${ligne.reference} deja presente -> ignore (id=${idProduitExistant})`);
        done += 1;
        notifier('ligne-terminee');
        continue;
      } else {
        notifier('creation-produit');
        await creerProduitApi(ligne, config, idCategorie, idGroupeTaxe, prixHt);
      }

      done += 1;
      notifier('ligne-terminee');
    } catch (erreur) {
      erreurs.push(`Ligne ${numeroLigne}: ${erreur.message}`);
    }
  }

  if (erreurs.length) {
    throw Object.assign(new Error('Import termine avec erreurs'), {
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

export const lireApercuCsvFichier1 = lireApercuCsv;
export const runImport = importerFichier1AvecApi;
