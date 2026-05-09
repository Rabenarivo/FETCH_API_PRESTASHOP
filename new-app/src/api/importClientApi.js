/**
 * importClientApi.js
 *
 * Flux d'import clients PrestaShop via API WebService.
 * Etapes :
 *   1) POST /api/customers  (obligatoire)
 *   2) POST /api/addresses  (optionnel - si adresse presente dans le CSV)
 *
 * Memes conventions que importProductApi.js :
 *   - fonctions en francais
 *   - commentaires courts et pedagogiques
 */

import { parsePrestaXML, getCollection, getErrorMessage, getValue } from '../config/parserXML';

// URL de base : proxy dev (/evals/api) ou production (variable d'env).
const URL_API =
  process.env.NODE_ENV === 'production'
    ? process.env.REACT_APP_PRESTASHOP_API_URL
    : '/evals/api';

// Configuration par defaut.
export const CONFIG_CLIENTS = {
  idLangue: 1,
  idBoutique: 1,
  separateur: ';',
  lignesAIgnorer: 1,
  idGroupeDefaut: 3, // 3 = groupe "Clients" dans PS 1.7
  idPaysDefaut: 8,   // 8 = France
};

// Champs disponibles pour le mapping CSV -> PrestaShop.
export const CHAMPS_CLIENTS = [
  { value: '', label: 'Ignorer cette colonne' },
  // --- Client ---
  { value: 'id_gender', label: 'Civilite (1=M, 2=Mme)' },
  { value: 'firstname', label: 'Prenom' },
  { value: 'lastname', label: 'Nom' },
  { value: 'email', label: 'Email' },
  { value: 'passwd', label: 'Mot de passe (texte clair)' },
  { value: 'birthday', label: 'Date de naissance (AAAA-MM-JJ)' },
  { value: 'newsletter', label: 'Newsletter (0/1)' },
  { value: 'optin', label: 'Offres partenaires (0/1)' },
  { value: 'active', label: 'Actif (0/1)' },
  { value: 'company', label: 'Entreprise' },
  { value: 'siret', label: 'SIRET' },
  { value: 'ape', label: 'APE' },
  { value: 'id_default_group', label: 'ID groupe par defaut' },
  // --- Adresse ---
  { value: 'addr_alias', label: 'Alias adresse' },
  { value: 'addr_firstname', label: 'Prenom (adresse)' },
  { value: 'addr_lastname', label: 'Nom (adresse)' },
  { value: 'addr_company', label: 'Societe (adresse)' },
  { value: 'addr_address1', label: 'Adresse ligne 1' },
  { value: 'addr_address2', label: 'Adresse ligne 2' },
  { value: 'addr_postcode', label: 'Code postal' },
  { value: 'addr_city', label: 'Ville' },
  { value: 'addr_phone', label: 'Telephone' },
  { value: 'addr_phone_mobile', label: 'Mobile' },
  { value: 'addr_country_iso', label: 'ISO pays (FR, BE...)' },
];

// Dictionnaire en-tetes CSV courants -> champs internes.
const ENTETES_VERS_CHAMP = {
  civilite: 'id_gender',
  genre: 'id_gender',
  gender: 'id_gender',
  prenom: 'firstname',
  firstname: 'firstname',
  nom: 'lastname',
  lastname: 'lastname',
  email: 'email',
  'e-mail': 'email',
  'mot de passe': 'passwd',
  password: 'passwd',
  passwd: 'passwd',
  'date de naissance': 'birthday',
  birthday: 'birthday',
  newsletter: 'newsletter',
  'offres partenaires': 'optin',
  optin: 'optin',
  actif: 'active',
  active: 'active',
  entreprise: 'company',
  company: 'company',
  societe: 'company',
  siret: 'siret',
  ape: 'ape',
  groupe: 'id_default_group',
  alias: 'addr_alias',
  adresse: 'addr_address1',
  'adresse 1': 'addr_address1',
  address1: 'addr_address1',
  'adresse 2': 'addr_address2',
  address2: 'addr_address2',
  'code postal': 'addr_postcode',
  postcode: 'addr_postcode',
  ville: 'addr_city',
  city: 'addr_city',
  telephone: 'addr_phone',
  phone: 'addr_phone',
  mobile: 'addr_phone_mobile',
  pays: 'addr_country_iso',
  country: 'addr_country_iso',
  'pays iso': 'addr_country_iso',
};

// ─── Utilitaires ───────────────────────────────────────────────────────────────

const enEntier = (valeur, defaut = 0) => {
  const n = parseInt(valeur, 10);
  return Number.isNaN(n) ? defaut : n;
};

const enOuiNon = (valeur, defaut = '0') => {
  if (valeur === '' || valeur === null || valeur === undefined) return defaut;
  const v = String(valeur).toLowerCase();
  return ['1', 'true', 'oui', 'yes'].includes(v) ? '1' : '0';
};

const echapperXml = (texte = '') =>
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

// ─── Appel API unique ───────────────────────────────────────────────────────────

// Point d'entree unique pour tous les appels HTTP (GET / POST).
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

  return { reponse, texte, donnees };
};

// Lit un noeud simple dans la reponse XML parsee.
const lireRessourceSimple = (donnees, nom) => {
  const noeud = donnees?.prestashop?.[nom];
  if (Array.isArray(noeud)) return noeud[0] || null;
  return noeud || null;
};

// ─── Recherche de l'ID pays par code ISO ───────────────────────────────────────

// Recupere l'ID PrestaShop d'un pays depuis son code ISO (ex: "FR" -> 8).
const trouverIdPays = async (isoCode) => {
  if (!isoCode) return null;
  // Si c'est deja un nombre, on le retourne directement.
  if (/^\d+$/.test(isoCode)) return enEntier(isoCode, null);

  const filtre = encodeURIComponent(isoCode.toUpperCase());
  const { donnees } = await requeteApi(`countries?filter[iso_code]=[${filtre}]&display=[id]`);
  const liste = getCollection(donnees, 'country');
  if (!liste.length) return null;
  return enEntier(getValue(liste[0].id, '0'), null);
};

// Verifie si un email existe deja dans PrestaShop.
// Retourne l'ID du client si trouve, null sinon.
const trouverClientParEmail = async (email) => {
  if (!email) return null;
  const filtre = encodeURIComponent(email);
  const { donnees } = await requeteApi(`customers?filter[email]=[${filtre}]&display=[id]`);
  const liste = getCollection(donnees, 'customer');
  if (!liste.length) return null;
  return enEntier(getValue(liste[0].id, '0'), null);
};

// ─── Etape 1 : creation du client ──────────────────────────────────────────────

// POST /api/customers  (obligatoire)
// Retourne l'id_customer cree.
const creerClientApi = async (ligne, config) => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <customer>
    <id_shop_group>1</id_shop_group>
    <id_shop>${config.idBoutique}</id_shop>
    <id_gender>${enEntier(ligne.id_gender, 0)}</id_gender>
    <id_default_group>${enEntier(ligne.id_default_group || config.idGroupeDefaut)}</id_default_group>
    <firstname>${echapperXml(ligne.firstname || '')}</firstname>
    <lastname>${echapperXml(ligne.lastname || '')}</lastname>
    <email>${echapperXml(ligne.email || '')}</email>
    <passwd>${echapperXml(ligne.passwd || 'MotDePasse123!')}</passwd>
    <birthday>${echapperXml(ligne.birthday || '0000-00-00')}</birthday>
    <newsletter>${enOuiNon(ligne.newsletter, '0')}</newsletter>
    <optin>${enOuiNon(ligne.optin, '0')}</optin>
    <active>${enOuiNon(ligne.active, '1')}</active>
    <company>${echapperXml(ligne.company || '')}</company>
    <siret>${echapperXml(ligne.siret || '')}</siret>
    <ape>${echapperXml(ligne.ape || '')}</ape>
  </customer>
</prestashop>`;

  const { donnees } = await requeteApi('customers', { methode: 'POST', xml });
  const client = lireRessourceSimple(donnees, 'customer');
  const idClient = enEntier(getValue(client?.id, '0'), 0);

  if (!idClient) throw new Error('Impossible de recuperer id_customer apres creation');
  return idClient;
};

// ─── Etape 2 : creation de l'adresse (optionnel) ───────────────────────────────

// POST /api/addresses  (optionnel - ignore si pas de ville ni adresse)
const creerAdresseClient = async (idClient, ligne, config) => {
  // Si pas d'adresse dans le CSV, on ne fait rien.
  const aAdresse = ligne.addr_address1 || ligne.addr_city || ligne.addr_postcode;
  if (!aAdresse) return;

  // Recupere l'ID pays depuis le code ISO (ex: FR -> 8).
  const idPays = ligne.addr_country_iso
    ? await trouverIdPays(ligne.addr_country_iso)
    : config.idPaysDefaut;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <address>
    <id_customer>${idClient}</id_customer>
    <id_country>${idPays || config.idPaysDefaut}</id_country>
    <id_state>0</id_state>
    <alias>${echapperXml(ligne.addr_alias || 'Mon adresse')}</alias>
    <firstname>${echapperXml(ligne.addr_firstname || ligne.firstname || '')}</firstname>
    <lastname>${echapperXml(ligne.addr_lastname || ligne.lastname || '')}</lastname>
    <company>${echapperXml(ligne.addr_company || ligne.company || '')}</company>
    <address1>${echapperXml(ligne.addr_address1 || '')}</address1>
    <address2>${echapperXml(ligne.addr_address2 || '')}</address2>
    <postcode>${echapperXml(ligne.addr_postcode || '')}</postcode>
    <city>${echapperXml(ligne.addr_city || '')}</city>
    <phone>${echapperXml(ligne.addr_phone || '')}</phone>
    <phone_mobile>${echapperXml(ligne.addr_phone_mobile || '')}</phone_mobile>
    <active>1</active>
  </address>
</prestashop>`;

  await requeteApi('addresses', { methode: 'POST', xml });
};

// ─── Lecture CSV ────────────────────────────────────────────────────────────────

/**
 * Lit un CSV et retourne les en-tetes + apercu des premieres lignes.
 */
export const lireApercuCsvClients = (file, separateur = ';', maxRows = 5) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      // Supprime le BOM UTF-8 si present.
      const contenu = e.target.result.replace(/^\uFEFF/, '');
      const lignes = contenu
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
    reader.readAsText(file, 'utf-8');
  });

/**
 * Detecte automatiquement le mapping CSV -> champs clients.
 */
export const detecterMappingClients = (headers) =>
  headers.map((header) => {
    const h = normaliserTexte(header);
    if (ENTETES_VERS_CHAMP[h]) return ENTETES_VERS_CHAMP[h];
    const match = CHAMPS_CLIENTS.find(
      (f) => f.value && (normaliserTexte(f.value) === h || normaliserTexte(f.label) === h)
    );
    return match ? match.value : '';
  });

// Transforme une ligne CSV (tableau de valeurs) en objet metier.
const construireLigne = (entetes, ligne, mapping) => {
  const objet = {};
  entetes.forEach((_, i) => {
    const champ = mapping[i];
    if (!champ) return;
    objet[champ] = (ligne[i] || '').trim();
  });
  return objet;
};

// ─── Import principal ──────────────────────────────────────────────────────────

/**
 * Importe un fichier CSV de clients via l'API PrestaShop.
 *
 * Flux :
 *   1) POST /api/customers   (obligatoire)
 *   2) POST /api/addresses   (optionnel)
 *
 * @param {File}     file       - Fichier CSV
 * @param {string[]} mapping    - Tableau de champs (un par colonne CSV)
 * @param {Function} onProgress - Callback({ done, total, percent })
 * @param {Object}   options    - Surcharge CONFIG_CLIENTS
 */
export const importerClientsAvecApi = async (file, mapping, onProgress, options = {}) => {
  const config = { ...CONFIG_CLIENTS, ...options };
  const { headers, rows } = await lireApercuCsvClients(file, config.separateur, 0);

  // On ignore les lignes d'en-tete supplementaires (ex: 2e ligne de titre).
  const extra = Math.max(0, enEntier(config.lignesAIgnorer, 1) - 1);
  const lignes = rows.slice(extra);
  const total = lignes.length;

  let done = 0;
  const erreurs = [];
  const warnings = [];

  const notifier = () => {
    const percent = total > 0 ? Math.round((done / total) * 100) : 100;
    onProgress({ done, total, percent });
  };

  for (let i = 0; i < lignes.length; i += 1) {
    const numeroLigne = i + 1 + config.lignesAIgnorer;
    const ligne = construireLigne(headers, lignes[i], mapping);

    try {
      // Validation minimale : email + prenom + nom obligatoires.
      if (!ligne.email) throw new Error('Email manquant');
      if (!ligne.firstname) throw new Error('Prenom manquant');
      if (!ligne.lastname) throw new Error('Nom manquant');

      // Verifie si le client existe deja (evite les doublons).
      const idExistant = await trouverClientParEmail(ligne.email);
      if (idExistant) {
        warnings.push(`Ligne ${numeroLigne}: email ${ligne.email} deja present (id=${idExistant}) -> ignore`);
        done += 1;
        notifier();
        continue;
      }

      // 1) Cree le client.
      const idClient = await creerClientApi(ligne, config);

      // 2) Cree l'adresse si les donnees sont presentes.
      try {
        await creerAdresseClient(idClient, ligne, config);
      } catch (erreurAdresse) {
        warnings.push(`Ligne ${numeroLigne}: adresse non creee (${erreurAdresse.message})`);
      }

      done += 1;
      notifier();
    } catch (erreur) {
      erreurs.push(`Ligne ${numeroLigne}: ${erreur.message}`);
    }
  }

  if (erreurs.length) {
    throw Object.assign(new Error('Import termine avec erreurs'), {
      details: [...erreurs, ...warnings],
    });
  }

  notifier();
  return { doneCount: done, totalCount: total, warnings };
};
