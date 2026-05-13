import React, { useState } from 'react';
import { runPartialReset } from '../../api/deleteApi';
import './ResetDatabase.css';

function ResetDatabase() {
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState([]);
  const [isError, setIsError] = useState(false);

  const addLog = (text) => {
    setLogs((prev) => [...prev, text]);
  };

  const handleReset = async () => {
    const confirmed = window.confirm(
      'Voulez-vous lancer la reinitialisation partielle de la base ?'
    );

    if (!confirmed) return;

    setIsRunning(true);
    setLogs(['Demarrage de la reinitialisation...']);
    setIsError(false);

    try {
      const summary = await runPartialReset({
        onProgress: (progress) => {
          const { resource, deleted, total } = progress;
          if (total === 0) {
            addLog(`  └─ ${resource}: vide`);
          } else {
            addLog(`  └─ ${resource}: ${deleted}/${total} traite(s)`);
          }
        },
      });

      if (summary.failed.length > 0) {
        addLog(`\nTermine avec ${summary.failed.length} erreur(s).`);
        addLog(`Ressources traitees: ${summary.deleted.length}`);
        setIsError(true);
      } else {
        addLog(`\nReinitialisation reussie!`);
        addLog(`Ressources traitees: ${summary.deleted.length}`);
        setIsError(false);
      }
    } catch (error) {
      addLog(`\nERREUR: ${error.message}`);
      setIsError(true);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="reset-container">
      <div className="reset-card">
        <h2>Reinitialisation partielle</h2>
        <p>
          Ce bouton supprime les donnees des APIs autorisees dans le bon ordre.
        </p>

        <button className="reset-btn" onClick={handleReset} disabled={isRunning}>
          {isRunning ? 'Traitement...' : 'Lancer la reinitialisation'}
        </button>

        {logs.length > 0 && (
          <div className={`reset-logs ${isError ? 'error' : 'success'}`}>
            {logs.map((log, i) => (
              <div key={i} className="reset-log-line">
                {log}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ResetDatabase;
