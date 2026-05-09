import React, { useState } from 'react';
import {
  CHAMPS_CLIENTS,
  lireApercuCsvClients,
  detecterMappingClients,
  importerClientsAvecApi,
} from '../api/importClientApi';
import './Import.css';

// ─── Selecteur de champ pour une colonne CSV ────────────────────────────────
function FieldSelector({ colIndex, value, onChange }) {
  return (
    <select
      className="field-select"
      value={value}
      onChange={(e) => onChange(colIndex, e.target.value)}
    >
      {CHAMPS_CLIENTS.map((champ) => (
        <option key={champ.value} value={champ.value}>
          {champ.label}
        </option>
      ))}
    </select>
  );
}

// ─── Composant principal d'import clients ───────────────────────────────────
function ClientImporter() {
  // Fichier CSV selectionne.
  const [file, setFile] = useState(null);

  // Colonnes lues depuis la premiere ligne du CSV.
  const [headers, setHeaders] = useState([]);

  // Quelques lignes pour previsualiser les donnees.
  const [previewRows, setPreviewRows] = useState([]);

  // Mapping : champ PrestaShop pour chaque colonne CSV.
  const [mapping, setMapping] = useState([]);

  // Nombre de lignes d'en-tete a ignorer avant les donnees.
  const [skipLines, setSkipLines] = useState(1);

  // Etat de l'import.
  const [isImporting, setIsImporting] = useState(false);
  const [progression, setProgression] = useState('');

  // Messages a afficher apres l'import.
  const [succes, setSucces] = useState('');
  const [erreurs, setErreurs] = useState([]);
  const [avertissements, setAvertissements] = useState([]);

  // Reinitialise tous les messages.
  const reinitialiserMessages = () => {
    setSucces('');
    setErreurs([]);
    setAvertissements([]);
    setProgression('');
  };

  // ── Chargement du fichier CSV ──────────────────────────────────────────────
  const handleFileChange = async (e) => {
    const selectedFile = e.target.files?.[0] || null;
    setFile(selectedFile);
    setHeaders([]);
    setPreviewRows([]);
    setMapping([]);
    reinitialiserMessages();

    if (!selectedFile) return;

    try {
      // Lit les colonnes + apercu des 5 premieres lignes.
      const { headers: csvHeaders, rows } = await lireApercuCsvClients(selectedFile, ';');
      setHeaders(csvHeaders);
      setPreviewRows(rows);
      // Detecte automatiquement le champ PrestaShop pour chaque colonne.
      setMapping(detecterMappingClients(csvHeaders));
    } catch (error) {
      setErreurs([error.message || 'Impossible de lire le fichier CSV']);
    }
  };

  // ── Changement manuel du mapping d'une colonne ──────────────────────────────
  const handleMappingChange = (colIndex, newValue) => {
    setMapping((prev) => {
      const next = [...prev];
      next[colIndex] = newValue;
      return next;
    });
  };

  // ── Lancement de l'import ────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!file) {
      setErreurs(["Selectionnez un fichier CSV avant de lancer l'import"]);
      return;
    }

    setIsImporting(true);
    reinitialiserMessages();
    setProgression('Import en cours...');

    try {
      const resultat = await importerClientsAvecApi(
        file,
        mapping,
        // Mise a jour du compteur a chaque client traite.
        ({ done, total }) => setProgression(`Import en cours... ${done} / ${total}`),
        { lignesAIgnorer: skipLines }
      );

      // Avertissements non bloquants (ex: doublon email ignore).
      if (resultat.warnings?.length) {
        setAvertissements(resultat.warnings);
      }

      setSucces(`Import reussi : ${resultat.doneCount} client(s) traite(s) sur ${resultat.totalCount}`);
      setProgression('');
    } catch (error) {
      // Erreur principale + detail de chaque ligne en echec.
      setErreurs([error.message, ...(error.details || [])]);
      setProgression('');
    } finally {
      setIsImporting(false);
    }
  };

  // ── Rendu ──────────────────────────────────────────────────────────────────
  return (
    <div className="import-container">
      <div className="import-card">
        <h2>Import Clients PrestaShop</h2>

        {/* Etape 1 : choix du fichier */}
        <section className="import-section">
          <h3>1. Fichier CSV</h3>

          <div className="form-group">
            <label className="form-label">
              Separateur : <strong>;</strong> (point-virgule)
            </label>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              disabled={isImporting}
              className="form-input"
            />
            {file && (
              <p className="file-info">
                {file.name} — {(file.size / 1024).toFixed(1)} Ko
              </p>
            )}
          </div>

          <div className="form-group inline">
            <label className="form-label">Lignes d'en-tete a ignorer :</label>
            <input
              type="number"
              min="0"
              max="10"
              value={skipLines}
              onChange={(e) => setSkipLines(Number(e.target.value))}
              disabled={isImporting}
              className="form-input-small"
            />
          </div>
        </section>

        {/* Etape 2 : mapping colonnes (visible apres chargement) */}
        {headers.length > 0 && (
          <section className="import-section">
            <h3>2. Correspondance des colonnes</h3>
            <p className="hint">
              Pour chaque colonne du CSV, choisissez le champ PrestaShop correspondant.
            </p>
            <div className="preview-wrap">
              <table className="preview-table">
                <thead>
                  <tr>
                    {headers.map((header, i) => (
                      <th key={i}>
                        {/* Nom de la colonne CSV */}
                        <div className="preview-col-header">{header}</div>
                        {/* Selecteur du champ PrestaShop */}
                        <FieldSelector
                          colIndex={i}
                          value={mapping[i] ?? ''}
                          onChange={handleMappingChange}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {headers.map((_, colIndex) => (
                        <td key={colIndex} title={row[colIndex] ?? ''}>
                          {row[colIndex] || <span className="cell-empty">-</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Bouton d'import + progression */}
        <div className="import-actions">
          <button
            onClick={handleImport}
            disabled={!file || isImporting}
            className="import-btn"
          >
            {isImporting ? 'Import en cours...' : 'Importer'}
          </button>

          {progression && (
            <span className="status-badge">{progression}</span>
          )}
        </div>

        {/* Message de succes */}
        {succes && (
          <div className="alert alert-success">{succes}</div>
        )}

        {/* Avertissements non bloquants */}
        {avertissements.length > 0 && (
          <div className="alert alert-warning">
            <strong>Avertissements :</strong>
            <ul>
              {avertissements.map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Erreurs bloquantes */}
        {erreurs.length > 0 && (
          <div className="alert alert-error">
            <strong>Erreurs :</strong>
            <ul>
              {erreurs.map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default ClientImporter;
