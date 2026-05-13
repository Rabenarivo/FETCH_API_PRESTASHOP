import React, { useState } from 'react';
import {
  CONFIG_FICHIER1,
  detecterMappingFichier1,
  importerFichier1AvecApi,
} from '../../api/importFichier1API';
import {
  CONFIG_FICHIER2,
  detecterMappingFichier2,
  importerFichier2AvecApi,
} from '../../api/importFichier2API';
import {
  CONFIG_FICHIER3,
  detecterMappingFichier3,
  importerFichier3AvecApi,
  lireApercuCsvFichier3,
} from '../../api/importFichier3API';
import './Import.css';
import './ImportMultiple.css';

const IMPORTS = [
  {
    label: 'Fichier 1',
    config: CONFIG_FICHIER1,
    detecterMapping: detecterMappingFichier1,
    importer: importerFichier1AvecApi,
  },
  {
    label: 'Fichier 2',
    config: CONFIG_FICHIER2,
    detecterMapping: detecterMappingFichier2,
    importer: importerFichier2AvecApi,
  },
  {
    label: 'Fichier 3',
    config: CONFIG_FICHIER3,
    detecterMapping: detecterMappingFichier3,
    importer: importerFichier3AvecApi,
  },
];

const etatVide = () => ({
  file: null,
  headers: [],
  mapping: [],
  separateur: '',
  error: '',
});

const detecterSeparateur = (contenu) => {
  const premiereLigne = String(contenu || '').replace(/^\uFEFF/, '').split(/\r?\n/)[0] || '';
  const nbVirgules = (premiereLigne.match(/,/g) || []).length;
  const nbPointVirgules = (premiereLigne.match(/;/g) || []).length;
  return nbVirgules >= nbPointVirgules ? ',' : ';';
};

const parserCsvSimple = (contenu, separateur = ';') => {
  const lignes = String(contenu || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((ligne) => ligne.trim())
    .filter(Boolean);

  if (!lignes.length) return { headers: [] };

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

  return { headers: parseLine(lignes[0]) };
};

const parserAvecEssais = (contenu) => {
  const separateurDetecte = detecterSeparateur(contenu);
  const essais = [separateurDetecte, separateurDetecte === ',' ? ';' : ','];

  for (const separateur of essais) {
    const parsed = parserCsvSimple(contenu, separateur);
    if (parsed.headers.length > 1) {
      return { headers: parsed.headers, separateur };
    }
  }

  return { headers: [], separateur: separateurDetecte };
};

const ordonnerFichiersSelectionnes = (listeFichiers) => {
  const copie = [...listeFichiers];
  const dejaPris = new Set();

  const prendreParNumero = (numero) => {
    const regex = new RegExp(`fichier\\s*${numero}|fichier${numero}`, 'i');
    const idx = copie.findIndex((fichier, i) => !dejaPris.has(i) && regex.test(fichier.name || ''));
    if (idx >= 0) {
      dejaPris.add(idx);
      return copie[idx];
    }
    return null;
  };

  const tries = [prendreParNumero(1), prendreParNumero(2), prendreParNumero(3)];
  const restants = copie.filter((_, i) => !dejaPris.has(i));

  return tries.map((fichier) => fichier || restants.shift() || null);
};

function ImportMultiple() {
  const [fichiers, setFichiers] = useState([etatVide(), etatVide(), etatVide()]);
  const [importEnCours, setImportEnCours] = useState(false);
  const [logs, setLogs] = useState([]);
  const [erreurs, setErreurs] = useState([]);

  const handleFilesChange = async (event) => {
    const selection = ordonnerFichiersSelectionnes(Array.from(event.target.files || []).slice(0, 3));
    setLogs([]);
    setErreurs([]);

    const next = await Promise.all(
      IMPORTS.map(async (definition, index) => {
        const file = selection[index];
        if (!file) return etatVide();

        try {
          if (index === 2) {
            const { headers, separateur } = await lireApercuCsvFichier3(file, definition.config.separateur);
            return {
              file,
              headers,
              mapping: definition.detecterMapping(headers),
              separateur,
              error: headers.length > 1 ? '' : 'CSV vide ou illisible',
            };
          }

          const contenu = await file.text();
          const parsed = parserAvecEssais(contenu);
          return {
            file,
            headers: parsed.headers,
            mapping: definition.detecterMapping(parsed.headers),
            separateur: parsed.separateur,
            error: parsed.headers.length > 1 ? '' : 'CSV vide ou illisible',
          };
        } catch (e) {
          return {
            file,
            headers: [],
            mapping: [],
            separateur: '',
            error: e.message || 'Impossible de lire le fichier',
          };
        }
      })
    );

    setFichiers(next);
  };

  const importerTout = async () => {
    const erreursLocales = [];
    const logsLocaux = [];

    if (fichiers.some((f) => !f.file)) {
      setErreurs(['Selectionne les 3 fichiers pour importer.']);
      return;
    }

    setImportEnCours(true);
    setErreurs([]);
    setLogs([]);

    try {
      for (let index = 0; index < IMPORTS.length; index += 1) {
        const definition = IMPORTS[index];
        const fichier = fichiers[index];

        if (fichier.error) {
          throw new Error(`${definition.label}: ${fichier.error}`);
        }

        logsLocaux.push(`${definition.label}: import en cours...`);
        setLogs([...logsLocaux]);

        // Ordre strict: 1 puis 2 puis 3.
        // eslint-disable-next-line no-await-in-loop
        const result = await definition.importer(
          fichier.file,
          fichier.mapping,
          ({ done, total, status }) => {
            const texte = `${definition.label}: ${done}/${total}${status ? ` - ${status}` : ''}`;
            const sansDoublon = logsLocaux.filter((ligne) => !ligne.startsWith(`${definition.label}:`));
            sansDoublon.push(texte);
            setLogs([...sansDoublon]);
          },
          { ...definition.config, separateur: 'auto' }
        );

        logsLocaux.push(
          `${definition.label}: termine (${result.successCount || 0} importees, ${result.ignoredCount || 0} ignorees, ${result.doneCount || 0} traitees)`
        );
        setLogs([...logsLocaux]);
      }
    } catch (e) {
      erreursLocales.push(e.message || 'Erreur import');
      if (Array.isArray(e.details) && e.details.length) {
        erreursLocales.push(...e.details);
      }
    } finally {
      setImportEnCours(false);
      setErreurs(erreursLocales);
    }
  };

  return (
    <div className="import-multiple-container">
      <div className="import-multiple-header">
        <div>
          <p className="import-multiple-kicker">Import groupe</p>
          <h2>Import multiple</h2>
          <p className="import-multiple-subtitle">Un seul bouton pour lancer les imports dans l ordre: 1, 2, puis 3.</p>
        </div>

        <div className="import-multiple-actions">
          <input type="file" accept=".csv" multiple onChange={handleFilesChange} className="form-input import-input-multiple" />
          <button type="button" className="import-btn import-all-btn" onClick={importerTout} disabled={importEnCours}>
            {importEnCours ? 'Import en cours...' : 'Importer les 3 fichiers'}
          </button>
        </div>
      </div>

      <div className="import-order-list">
        {IMPORTS.map((definition, index) => (
          <div key={definition.label} className="import-order-item">
            <strong>{index + 1}. {definition.label}</strong>
            <span>{fichiers[index].file ? fichiers[index].file.name : 'Aucun fichier'}</span>
            <span>Separateur: {fichiers[index].separateur || 'auto'}</span>
          </div>
        ))}
      </div>

      {logs.length > 0 && (
        <div className="message success-message">
          <strong>Suivi import :</strong>
          <ul>
            {logs.map((ligne, index) => (
              <li key={`${ligne}-${index}`}>{ligne}</li>
            ))}
          </ul>
        </div>
      )}

      {erreurs.length > 0 && (
        <div className="message error-message">
          <strong>Erreurs :</strong>
          <ul>
            {erreurs.map((erreur, index) => (
              <li key={`${erreur}-${index}`}>{erreur}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default ImportMultiple;
