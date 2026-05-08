import React, { useState } from 'react';
import {
  PRESTA_FIELDS,
  lireApercuCsv,
  detecterMappingAutomatique,
  importerProduitsAvecApi,
} from '../api/importProductApi';
import './Import.css';

function FieldSelector({ colIndex, value, onChange }) {
  return (
    <select
      className="field-select"
      value={value}
      onChange={(e) => onChange(colIndex, e.target.value)}
    >
      {PRESTA_FIELDS.map((field) => (
        <option key={field.value} value={field.value}>
          {field.label}
        </option>
      ))}
    </select>
  );
}

function ProductImporter() {
  const [file, setFile] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [previewRows, setPreviewRows] = useState([]);
  const [mapping, setMapping] = useState([]);
  const [skipLines, setSkipLines] = useState(1);

  const [isImporting, setIsImporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessages, setErrorMessages] = useState([]);
  const [warningMessages, setWarningMessages] = useState([]);

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files?.[0] || null;

    setFile(selectedFile);
    setHeaders([]);
    setPreviewRows([]);
    setMapping([]);
    setStatusMessage('');
    setSuccessMessage('');
    setErrorMessages([]);
    setWarningMessages([]);

    if (!selectedFile) {
      return;
    }

    try {
      const { headers: csvHeaders, rows } = await lireApercuCsv(selectedFile, ';');
      setHeaders(csvHeaders);
      setPreviewRows(rows);
      setMapping(detecterMappingAutomatique(csvHeaders));
    } catch (error) {
      setErrorMessages([error.message || 'Impossible de lire le fichier CSV']);
    }
  };

  const handleMappingChange = (colIndex, newValue) => {
    setMapping((previous) => {
      const next = [...previous];
      next[colIndex] = newValue;
      return next;
    });
  };

  const handleImport = async () => {
    if (!file) {
      setErrorMessages(['Selectionnez un fichier CSV']);
      return;
    }

    setIsImporting(true);
    setStatusMessage('Import en cours...');
    setSuccessMessage('');
    setErrorMessages([]);
    setWarningMessages([]);

    try {
      const result = await importerProduitsAvecApi(
        file,
        mapping,
        ({ done, total }) => {
          setStatusMessage(`Import en cours... ${done}/${total}`);
        },
        { lignesAIgnorer: skipLines }
      );

      if (result.warnings?.length) {
        setWarningMessages(result.warnings);
      }

      setSuccessMessage(`Import reussi : ${result.doneCount} produits traites`);
      setStatusMessage('Termine');
    } catch (error) {
      const details = error.details || [];
      setErrorMessages([error.message, ...details]);
      setStatusMessage('Erreur');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="import-container">
      <div className="import-card">
        <h2>Import Produits PrestaShop</h2>

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
            {file && <p className="file-info">{file.name} - {(file.size / 1024).toFixed(1)} KB</p>}
          </div>

          <div className="form-group inline">
            <label className="form-label">Lignes a ignorer (en-tetes) :</label>
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

        {headers.length > 0 && (
          <section className="import-section">
            <h3>2. Correspondance des donnees</h3>
            <p className="hint">Selectionnez le champ PrestaShop pour chaque colonne du CSV.</p>
            <div className="preview-wrap">
              <table className="preview-table">
                <thead>
                  <tr>
                    {headers.map((header, i) => (
                      <th key={i}>
                        <div className="preview-col-header">{header}</div>
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
                          {row[colIndex] !== undefined && row[colIndex] !== ''
                            ? row[colIndex]
                            : <span className="cell-empty">-</span>}
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
          <button onClick={handleImport} disabled={!file || isImporting} className="import-btn">
            {isImporting ? 'Import en cours...' : 'Importer'}
          </button>
          {statusMessage && !isImporting && (
            <span className="status-badge">{statusMessage}</span>
          )}
        </div>

        {successMessage && <div className="alert alert-success">{successMessage}</div>}

        {warningMessages.length > 0 && (
          <div className="alert alert-error">
            <strong>Avertissements :</strong>
            <ul>
              {warningMessages.map((warning, i) => <li key={i}>{warning}</li>)}
            </ul>
          </div>
        )}

        {errorMessages.length > 0 && (
          <div className="alert alert-error">
            <strong>Erreurs :</strong>
            <ul>
              {errorMessages.map((message, i) => <li key={i}>{message}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default ProductImporter;
