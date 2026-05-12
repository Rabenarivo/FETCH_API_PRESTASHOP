import React, { useState } from 'react';
import { importerFichier1AvecApi, detecterMappingFichier1, CONFIG_FICHIER1 } from '../../api/importFichier1API';
import './Import.css';

const CONFIG_TEST = {
  ...CONFIG_FICHIER1,
  separateur: 'auto',
};

const PRESTA_FIELDS_FICHIER1 = [
  { value: '', label: 'Ignorer cette colonne' },
  { value: 'date_produit', label: 'Date produit' },
  { value: 'nom', label: 'Nom' },
  { value: 'reference', label: 'Référence' },
  { value: 'prix_ttc', label: 'Prix TTC' },
  { value: 'taxe', label: 'Taxe' },
  { value: 'categorie', label: 'Catégorie' },
];

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

const enNombre = (valeur, defaut = 0) => {
  const normalisee = String(valeur ?? '').replace(',', '.').replace(/\s/g, '');
  const n = parseFloat(normalisee);
  return Number.isNaN(n) ? defaut : n;
};

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

const construireLigne = (headers, row, mapping) => {
  const data = {};
  headers.forEach((_, index) => {
    const field = mapping[index];
    if (!field) return;
    data[field] = (row[index] || '').trim();
  });
  return data;
};

function FieldSelector({ colIndex, value, onChange }) {
  return (
    <select
      className="field-select"
      value={value}
      onChange={(e) => onChange(colIndex, e.target.value)}
    >
      {PRESTA_FIELDS_FICHIER1.map((field) => (
        <option key={field.value} value={field.value}>
          {field.label}
        </option>
      ))}
    </select>
  );
}

function ImportFichier1Test() {
  const [file, setFile] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [previewRows, setPreviewRows] = useState([]);
  const [mapping, setMapping] = useState([]);
  const [separateurDetecte, setSeparateurDetecte] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
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
    setIsImporting(false);

    if (!selectedFile) return;

    try {
      const contenu = await selectedFile.text();
      const separateur = CONFIG_TEST.separateur === 'auto'
        ? detecterSeparateur(contenu)
        : CONFIG_TEST.separateur;
      const parsed = parserCsvSimple(contenu, separateur);
      setHeaders(parsed.headers);
      setPreviewRows(parsed.rows);
      setMapping(detecterMappingFichier1(parsed.headers));
      setSeparateurDetecte(separateur);

      if (parsed.headers.length <= 1) {
        setError('Le CSV semble mal séparé. Vérifie le séparateur du fichier.');
      }
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
      setError('Veuillez charger un fichier CSV avant le test');
      return;
    }

    setError('');
    setStatus('Import réel en cours...');
    setIsImporting(true);

    try {
      const result = await importerFichier1AvecApi(
        file,
        mapping,
        ({ done, total, status: step }) => {
          setStatus(`Import réel en cours... ${done}/${total}${step ? ` - ${step}` : ''}`);
        },
        CONFIG_TEST
      );

      console.log('=== IMPORT FICHIER 1 TERMINE ===');
      console.log('Headers:', headers);
      console.log('Mapping:', mapping);
      console.log('Resultat:', result);

      setStatus(`Import terminé: ${result.doneCount} ligne(s) traitée(s)`);
    } catch (e) {
      setError(e.message || 'Erreur pendant l’import réel');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="import-container">
      <div className="import-card">
        <h2>Test import fichier 1</h2>
        <p className="hint">Ce composant ne fait aucun POST/PUT. Il affiche seulement les payloads simulés dans la console.</p>

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
                        <FieldSelector
                          colIndex={index}
                          value={mapping[index] ?? ''}
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
        {error && <div className="message error-message">{error}</div>}
      </div>
    </div>
  );
}

export default ImportFichier1Test;
