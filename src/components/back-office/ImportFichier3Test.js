import React, { useState } from 'react';
import {
  CONFIG_FICHIER3,
  detecterMappingFichier3,
  importerFichier3AvecApi,
  lireApercuCsvFichier3,
} from '../../api/importFichier3API';
import './Import.css';

function FieldSelector({ colIndex, value, onChange }) {
  return (
    <select className="field-select" value={value} onChange={(e) => onChange(colIndex, e.target.value)}>
      <option value="">Ignorer cette colonne</option>
      <option value="date">Date</option>
      <option value="nom">Nom</option>
      <option value="email">Email</option>
      <option value="pwd">Mot de passe</option>
      <option value="adresse">Adresse</option>
      <option value="achat">Achat</option>
      <option value="etat">Etat</option>
    </select>
  );
}

function ImportFichier3Test() {
  const [file, setFile] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [previewRows, setPreviewRows] = useState([]);
  const [mapping, setMapping] = useState([]);
  const [separateurDetecte, setSeparateurDetecte] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [warnings, setWarnings] = useState([]);
  const [isImporting, setIsImporting] = useState(false);

  const handleFileChange = async (event) => {
    const selectedFile = event.target.files?.[0] || null;
    setFile(selectedFile);
    setHeaders([]);
    setPreviewRows([]);
    setMapping([]);
    setSeparateurDetecte('');
    setError('');
    setStatus('');
    setWarnings([]);
    setIsImporting(false);

    if (!selectedFile) return;

    try {
      const { headers: csvHeaders, rows, separateur } = await lireApercuCsvFichier3(
        selectedFile,
        CONFIG_FICHIER3.separateur
      );
      setHeaders(csvHeaders);
      setPreviewRows(rows);
      setMapping(detecterMappingFichier3(csvHeaders));
      setSeparateurDetecte(separateur);
    } catch (e) {
      setError(e.message || 'Impossible de lire le fichier CSV');
    }
  };

  const handleMappingChange = (colIndex, newValue) => {
    setMapping((previous) => {
      const next = [...previous];
      next[colIndex] = newValue;
      return next;
    });
  };

  const handleImportReel = async () => {
    if (!file || !headers.length) {
      setError('Veuillez charger un fichier CSV avant de lancer l import');
      return;
    }

    setError('');
    setWarnings([]);
    setStatus('Import réel en cours...');
    setIsImporting(true);

    try {
      const result = await importerFichier3AvecApi(
        file,
        mapping,
        ({ done, total, status: step }) => {
          setStatus(`Import réel en cours... ${done}/${total}${step ? ` - ${step}` : ''}`);
        },
        CONFIG_FICHIER3
      );

      if (Array.isArray(result.warnings) && result.warnings.length) {
        setWarnings(result.warnings);
      }

      setStatus(
        `Import terminé: ${result.successCount || 0} importée(s), ${result.ignoredCount || 0} ignorée(s), ${result.doneCount || 0} traitée(s)`
      );
    } catch (e) {
      console.error('[fichier3] erreur import', {
        message: e?.message || 'Erreur pendant l import réel',
        details: e?.details || [],
      });
      if (Array.isArray(e?.details) && e.details.length) {
        setWarnings(e.details);
      }
      setError(e.message || "Erreur pendant l import réel");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="import-container">
      <div className="import-card">
        <h2>Test import fichier 3 (Clients + commandes)</h2>
        <p className="hint">
          Le fichier 3 crée le client, l adresse, le panier, la commande et tente d appliquer l état.
        </p>

        <section className="import-section">
          <h3>1. Fichier CSV</h3>
          <div className="form-group">
            <label className="form-label">
              Séparateur: <strong>{separateurDetecte || 'auto'}</strong>
            </label>
            <input type="file" accept=".csv" onChange={handleFileChange} className="form-input" />
            {file && <p className="file-info">{file.name} - {(file.size / 1024).toFixed(1)} KB</p>}
          </div>
        </section>

        {headers.length > 0 && (
          <section className="import-section">
            <h3>2. Correspondance des données</h3>
            <div className="preview-wrap">
              <table className="preview-table">
                <thead>
                  <tr>
                    {headers.map((header, index) => (
                      <th key={index}>
                        <div className="preview-col-header">{header}</div>
                        <FieldSelector colIndex={index} value={mapping[index] ?? ''} onChange={handleMappingChange} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {headers.map((_, colIndex) => (
                        <td key={colIndex} title={row[colIndex] ?? ''}>
                          {row[colIndex] !== undefined && row[colIndex] !== '' ? row[colIndex] : <span className="cell-empty">-</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <div className="import-actions">
          <button onClick={handleImportReel} disabled={!file || !headers.length || isImporting} className="import-btn">
            {isImporting ? 'Import en cours...' : 'Importer dans la base'}
          </button>
        </div>

        {status && <div className="message success-message">{status}</div>}
        {warnings.length > 0 && (
          <div className="message warning-message">
            <strong>Avertissements :</strong>
            <ul>
              {warnings.map((warning, index) => (
                <li key={`${warning}-${index}`}>{warning}</li>
              ))}
            </ul>
          </div>
        )}
        {error && <div className="message error-message">{error}</div>}
      </div>
    </div>
  );
}

export default ImportFichier3Test;
