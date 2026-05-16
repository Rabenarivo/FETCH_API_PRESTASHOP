/**
 * exceptionAPI.js
 *
 * Validations communes pour les imports CSV.
 */

export class ImportValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'ImportValidationError';
    this.details = Array.isArray(details) ? details : [String(details)];
  }
}

const formaterContexte = (ligne, champ) => {
  const morceaux = [];
  if (ligne !== undefined && ligne !== null) morceaux.push(`Ligne ${ligne}`);
  if (champ) morceaux.push(`champ "${champ}"`);
  return morceaux.length ? `${morceaux.join(' - ')}: ` : '';
};

export const validerColonnesObligatoires = ({
  mapping = [],
  requiredFields = [],
  labelByField = {},
  fichier = 'import',
}) => {
  const manquants = requiredFields.filter((field) => !mapping.includes(field));
  if (!manquants.length) return;

  const labels = manquants.map((field) => labelByField[field] || field);
  throw new ImportValidationError(
    `${fichier}: nom de colonne non conforme. Colonnes obligatoires manquantes: ${labels.join(', ')}`
  );
};

export const validerDateDdMmYyyy = (value, { champ = 'date', ligne, obligatoire = false } = {}) => {
  const brut = String(value ?? '').trim();
  const prefixe = formaterContexte(ligne, champ);

  if (!brut) {
    if (obligatoire) {
      throw new ImportValidationError(`${prefixe}date obligatoire au format DD/MM/YYYY`);
    }
    return;
  }

  const match = brut.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    throw new ImportValidationError(`${prefixe}format de date invalide. Attendu: DD/MM/YYYY`);
  }

  const jour = Number(match[1]);
  const mois = Number(match[2]);
  const annee = Number(match[3]);
  const date = new Date(Date.UTC(annee, mois - 1, jour));

  const isValid =
    date.getUTCFullYear() === annee
    && date.getUTCMonth() === mois - 1
    && date.getUTCDate() === jour;

  if (!isValid) {
    throw new ImportValidationError(`${prefixe}date invalide. Attendu: DD/MM/YYYY`);
  }
};

export const validerMontantPositif = (
  value,
  { champ = 'montant', ligne, obligatoire = false } = {}
) => {
  const brut = String(value ?? '').trim();
  const prefixe = formaterContexte(ligne, champ);

  if (!brut) {
    if (obligatoire) {
      throw new ImportValidationError(`${prefixe}montant obligatoire et positif`);
    }
    return null;
  }

  const n = parseFloat(brut.replace(',', '.').replace(/\s/g, ''));
  if (Number.isNaN(n)) {
    throw new ImportValidationError(`${prefixe}montant invalide`);
  }
  if (n <= 0) {
    throw new ImportValidationError(`${prefixe}montant doit etre strictement positif`);
  }

  return n;
};
