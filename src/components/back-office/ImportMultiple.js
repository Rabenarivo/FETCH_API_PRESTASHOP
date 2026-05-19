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

// ---------------------------------------------------------
// Chaque entrée décrit un des 3 fichiers à importer.
// "config" = paramètres d'import, "importer" = la fonction
// qui envoie les données à PrestaShop.
// ---------------------------------------------------------
const LISTE_IMPORTS = [
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

// ---------------------------------------------------------
// Trouve le bon séparateur d'un fichier CSV (, ou ;)
// en comptant lequel apparaît le plus dans la 1ère ligne.
// ---------------------------------------------------------
function detecterSeparateur(contenu) {
  // On enlève le BOM (caractère invisible en début de fichier UTF-8)
  const premiereLigne = contenu.replace(/^\uFEFF/, '').split(/\r?\n/)[0] || '';
  const nbVirgules = (premiereLigne.match(/,/g) || []).length;
  const nbPointVirgules = (premiereLigne.match(/;/g) || []).length;
  return nbVirgules >= nbPointVirgules ? ',' : ';';
}

// ---------------------------------------------------------
// Lit la première ligne d'un CSV pour récupérer les en-têtes
// (noms des colonnes). Essaie , puis ; si besoin.
// ---------------------------------------------------------
function lireEnTetesCsv(contenu) {
  const separateur = detecterSeparateur(contenu);
  const premiereLigne = contenu.replace(/^\uFEFF/, '').split(/\r?\n/).find((l) => l.trim());

  if (!premiereLigne) return { headers: [], separateur };

  // Découpe la ligne selon le séparateur trouvé
  const headers = premiereLigne.split(separateur).map((h) => h.replace(/"/g, '').trim());
  return { headers, separateur };
}

// ---------------------------------------------------------
// Trie les fichiers sélectionnés pour que :
//   - fichier1 soit en position 0
//   - fichier2 soit en position 1
//   - fichier3 soit en position 2
// (peu importe l'ordre de sélection dans l'explorateur)
// ---------------------------------------------------------
function trierFichiersParNumero(listeFichiers) {
  // Cherche le fichier dont le nom contient "fichierN"
  function trouverFichier(numero) {
    const regex = new RegExp(`fichier.?${numero}`, 'i');
    return listeFichiers.find((f) => regex.test(f.name)) || null;
  }

  const f1 = trouverFichier(1);
  const f2 = trouverFichier(2);
  const f3 = trouverFichier(3);

  // Si un fichier n'est pas trouvé par son nom, on le laisse à null
  return [f1, f2, f3];
}

// ---------------------------------------------------------
// Composant principal
// ---------------------------------------------------------
function ImportMultiple() {
  // "fichiersInfo" stocke, pour chacun des 3 fichiers :
  // le File, les en-têtes CSV, le mapping colonnes, le séparateur, et une erreur éventuelle
  const [fichiersInfo, setFichiersInfo] = useState([
    { file: null, headers: [], mapping: [], separateur: '', erreur: '' },
    { file: null, headers: [], mapping: [], separateur: '', erreur: '' },
    { file: null, headers: [], mapping: [], separateur: '', erreur: '' },
  ]);

  const [importEnCours, setImportEnCours] = useState(false);
  const [logs, setLogs] = useState([]);       // messages de suivi
  const [erreurs, setErreurs] = useState([]); // messages d'erreur

  async function lireInfoFichier(importDef, file, index) {
    if (!file) {
      return { file: null, headers: [], mapping: [], separateur: '', erreur: '' };
    }

    try {
      if (index === 2) {
        const { headers, separateur } = await lireApercuCsvFichier3(file, importDef.config.separateur);
        return {
          file,
          headers,
          mapping: importDef.detecterMapping(headers),
          separateur,
          erreur: headers.length > 1 ? '' : 'CSV vide ou illisible',
        };
      }

      const contenu = await file.text();
      const { headers, separateur } = lireEnTetesCsv(contenu);
      return {
        file,
        headers,
        mapping: importDef.detecterMapping(headers),
        separateur,
        erreur: headers.length > 1 ? '' : 'CSV vide ou illisible',
      };
    } catch (e) {
      return {
        file,
        headers: [],
        mapping: [],
        separateur: '',
        erreur: e.message || 'Impossible de lire le fichier',
      };
    }
  }

  // -------------------------------------------------------
  // Appelée quand l'utilisateur choisit des fichiers.
  // On lit les en-têtes de chaque fichier CSV.
  // -------------------------------------------------------
  async function handleFileChange(index, event) {
    const file = Array.from(event.target.files || [])[0] || null;
    setLogs([]);
    setErreurs([]);

    const infoFichier = await lireInfoFichier(LISTE_IMPORTS[index], file, index);
    setFichiersInfo((precedents) =>
      precedents.map((info, position) => (position === index ? infoFichier : info))
    );
  }

  // -------------------------------------------------------
  // Lance l'import d'UN seul fichier et met à jour les logs.
  // -------------------------------------------------------
  async function importerUnFichier(importDef, infoFichier, logsEnCours) {
    // Affiche "import en cours..." pour ce fichier
    logsEnCours.push(`${importDef.label} : import en cours...`);
    setLogs([...logsEnCours]);

    // Lance l'import et attend la fin
    const resultat = await importDef.importer(
      infoFichier.file,
      infoFichier.mapping,
      // Cette fonction est appelée à chaque ligne importée (progression)
      function onProgression({ done, total, status }) {
        const message = `${importDef.label} : ${done}/${total}${status ? ` — ${status}` : ''}`;
        // On retire l'ancienne ligne de progression et on met la nouvelle
        const sansAncien = logsEnCours.filter((l) => !l.startsWith(`${importDef.label} :`));
        sansAncien.push(message);
        setLogs([...sansAncien]);
      },
      // On force la détection automatique du séparateur CSV
      { ...importDef.config, separateur: 'auto' }
    );

    // Affiche le résumé une fois l'import terminé
    logsEnCours.push(
      `${importDef.label} : terminé` +
      ` (${resultat.successCount || 0} importées,` +
      ` ${resultat.ignoredCount || 0} ignorées,` +
      ` ${resultat.doneCount || 0} traitées)`
    );
    setLogs([...logsEnCours]);
  }

  // -------------------------------------------------------
  // Lance l'import des 3 fichiers dans l'ordre 1 → 2 → 3.
  // S'arrête dès qu'une erreur survient.
  // -------------------------------------------------------
  async function importerTout() {
    // Étape 1 : vérifie que les 3 fichiers sont bien sélectionnés
    if (fichiersInfo.some((f) => !f.file)) {
      setErreurs(['Sélectionne les 3 fichiers avant de lancer l\'import.']);
      return;
    }

    // Étape 2 : on démarre, on vide les anciens messages
    setImportEnCours(true);
    setErreurs([]);
    setLogs([]);

    const logsEnCours = [];

    try {
      // Étape 3 : on importe chaque fichier l'un après l'autre
      for (let i = 0; i < LISTE_IMPORTS.length; i++) {
        const importDef = LISTE_IMPORTS[i];
        const infoFichier = fichiersInfo[i];

        // Si le fichier a une erreur de lecture, on s'arrête tout de suite
        if (infoFichier.erreur) {
          throw new Error(`${importDef.label} : ${infoFichier.erreur}`);
        }

        // Import du fichier numéro i+1
        await importerUnFichier(importDef, infoFichier, logsEnCours);
      }
    } catch (e) {
      // Étape 4 : en cas d'erreur, on affiche le message
      const messages = [e.message || 'Erreur lors de l\'import'];
      if (Array.isArray(e.details)) {
        messages.push(...e.details);
      }
      setErreurs(messages);
    } finally {
      // Étape 5 : dans tous les cas, on remet le bouton actif
      setImportEnCours(false);
    }
  }

  // -------------------------------------------------------
  // Rendu : interface utilisateur
  // -------------------------------------------------------
  return (
    <div className="import-multiple-container">

      {/* Titre + actions */}
      <div className="import-multiple-header">
        <div>
          <p className="import-multiple-kicker">Import groupe</p>
          <h2>Import multiple</h2>
          <p className="import-multiple-subtitle">
            Un seul bouton pour lancer les imports dans l'ordre : 1, 2, puis 3.
          </p>
        </div>

        <div className="import-multiple-actions">
          <button
            type="button"
            className="import-btn import-all-btn"
            onClick={importerTout}
            disabled={importEnCours}
          >
            {importEnCours ? 'Import en cours...' : 'Importer les 3 fichiers'}
          </button>
        </div>
      </div>

      {/* Liste des fichiers détectés */}
      <div className="import-order-list">
        {LISTE_IMPORTS.map((importDef, index) => (
          <div key={importDef.label} className="import-order-item">
            <strong>{index + 1}. {importDef.label}</strong>
            <input
              type="file"
              accept=".csv"
              onChange={(event) => handleFileChange(index, event)}
              className="form-input import-input-single"
            />
            <span>{fichiersInfo[index].file ? fichiersInfo[index].file.name : 'Aucun fichier'}</span>
            <span>Séparateur : {fichiersInfo[index].separateur || 'auto'}</span>
            {fichiersInfo[index].erreur && (
              <span className="import-order-error">{fichiersInfo[index].erreur}</span>
            )}
          </div>
        ))}
      </div>

      {/* Messages de suivi */}
      {logs.length > 0 && (
        <div className="message success-message">
          <strong>Suivi import :</strong>
          <ul>
            {logs.map((ligne, index) => (
              <li key={index}>{ligne}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Messages d'erreur */}
      {erreurs.length > 0 && (
        <div className="message error-message">
          <strong>Erreurs :</strong>
          <ul>
            {erreurs.map((erreur, index) => (
              <li key={index}>{erreur}</li>
            ))}
          </ul>
        </div>
      )}

    </div>
  );
}

export default ImportMultiple;
