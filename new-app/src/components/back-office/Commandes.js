import React, { useState, useEffect, useCallback } from 'react';
import {
  listerCommandes,
  listerEtatsCommande,
  changerEtatCommande,
} from '../../api/commandeAPI';
import './Commandes.css';

// États proposés au changement (ids PrestaShop)
const IDS_ETATS_AUTORISES = ['6', '18', '19'];

const ETATS_AUTORISES_PAR_DEFAUT = {
  '6': 'Annulé',
  '18': 'Paiement effectué',
  '19': 'Dans le panier',
};

const COULEUR_ETAT = {
  '1': '#f0ad4e', '2': '#5cb85c', '3': '#5bc0de', '4': '#337ab7',
  '5': '#5cb85c', '6': '#d9534f', '7': '#888',    '8': '#d9534f',
  '9': '#f0ad4e', '10': '#f0ad4e','11': '#5cb85c','12': '#f0ad4e',
  '13': '#f0ad4e','14': '#f0ad4e','15': '#888',   '16': '#f0ad4e',
  '17': '#5bc0de','18': '#9b59b6','19': '#e67e22',
};

function BadgeEtat({ idEtat, libelle }) {
  return (
    <span className="badge-etat" style={{ background: COULEUR_ETAT[String(idEtat)] || '#aaa' }}>
      {libelle}
    </span>
  );
}

// ─── Ligne commande ───────────────────────────────────────────
function LigneCommande({ commande, etatsAutorises, onEtatChange }) {
  const [idEtatChoisi, setIdEtatChoisi] = useState('');
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState(false);

  const handleChanger = async () => {
    if (!idEtatChoisi) return;
    setChargement(true);
    setErreur('');
    setSucces(false);
    try {
      await changerEtatCommande(commande.id, idEtatChoisi);
      onEtatChange(commande.id, idEtatChoisi);
      setIdEtatChoisi('');
      setSucces(true);
      setTimeout(() => setSucces(false), 3000);
    } catch (e) {
      setErreur(e.message);
    } finally {
      setChargement(false);
    }
  };

  return (
    <li className="commande-row">
      <span className="col-id">{commande.id}</span>
      <span className="col-ref">{commande.reference}</span>
      <span className="col-nouveau">{commande.nouveauClient}</span>
      <span className="col-livraison">{commande.livraison}</span>
      <span className="col-client">{commande.client}</span>
      <span className="col-total">{Number(commande.total).toFixed(2)} €</span>
      <span className="col-paiement">{commande.paiement}</span>
      <span className="col-etat">
        <BadgeEtat idEtat={commande.idEtat} libelle={commande.etatLibelle} />
      </span>
      <span className="col-date">{commande.dateAjout}</span>
      <span className="col-actions">
        <select
          className="select-etat"
          value={idEtatChoisi}
          onChange={(e) => { setIdEtatChoisi(e.target.value); setErreur(''); setSucces(false); }}
          disabled={chargement}
        >
          <option value="">-- Changer l'état --</option>
          {etatsAutorises.map((e) => (
            <option key={e.id} value={e.id}>{e.nom}</option>
          ))}
        </select>
        {idEtatChoisi && (
          <button className="btn-changer-etat" onClick={handleChanger} disabled={chargement}>
            {chargement ? '…' : '✓ Valider'}
          </button>
        )}
        {succes && <span className="succes-inline">✓ Mis à jour</span>}
        {erreur && <span className="erreur-inline" title={erreur}>⚠ Erreur</span>}
      </span>
    </li>
  );
}

// ─── Composant principal ──────────────────────────────────────
function Commandes() {
  const [commandes, setCommandes] = useState([]);
  const [etatsAutorises, setEtatsAutorises] = useState([]);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState('');

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur('');
    try {
      const [listeCommandes, tousLesEtats] = await Promise.all([
        listerCommandes(),
        listerEtatsCommande(),
      ]);
      setCommandes(listeCommandes);
      const etatsApi = tousLesEtats
        .filter((e) => IDS_ETATS_AUTORISES.includes(String(e.id)))
        .reduce((acc, e) => {
          acc[String(e.id)] = e.nom;
          return acc;
        }, {});

      setEtatsAutorises(
        IDS_ETATS_AUTORISES.map((id) => ({
          id,
          nom: etatsApi[id] || ETATS_AUTORISES_PAR_DEFAUT[id] || `État #${id}`,
        }))
      );
    } catch (e) {
      setErreur(e.message || 'Erreur lors du chargement des commandes');
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const handleEtatChange = (idCommande, nouvelIdEtat) => {
    setCommandes((prev) =>
      prev.map((c) => {
        if (c.id !== idCommande) return c;
        const etatObj = etatsAutorises.find((e) => e.id === nouvelIdEtat);
        return { ...c, idEtat: nouvelIdEtat, etatLibelle: etatObj?.nom || `État #${nouvelIdEtat}` };
      })
    );
  };

  return (
    <div className="commandes-container">
      <div className="commandes-header-row">
        <h2>Commandes</h2>
        <button className="btn-rafraichir" onClick={charger} disabled={chargement}>
          {chargement ? 'Chargement…' : '↻ Rafraîchir'}
        </button>
      </div>

      {erreur && (
        <div className="error-message">
          <p>❌ {erreur}</p>
          <button onClick={charger} className="retry-btn">Réessayer</button>
        </div>
      )}

      {!erreur && (
        <div className="commandes-list-wrap">
          <ul className="commandes-list">
            <li className="commandes-list-header">
              <span className="col-id">ID</span>
              <span className="col-ref">Référence</span>
              <span className="col-nouveau">Nouveau client</span>
              <span className="col-livraison">Livraison</span>
              <span className="col-client">Client</span>
              <span className="col-total">Total</span>
              <span className="col-paiement">Paiement</span>
              <span className="col-etat">État</span>
              <span className="col-date">Date</span>
              <span className="col-actions">Actions</span>
            </li>

            {chargement && <li className="commandes-loading">Chargement des commandes…</li>}
            {!chargement && commandes.length === 0 && (
              <li className="commandes-empty">Aucune commande trouvée</li>
            )}
            {!chargement && commandes.map((c) => (
              <LigneCommande
                key={c.id}
                commande={c}
                etatsAutorises={etatsAutorises}
                onEtatChange={handleEtatChange}
              />
            ))}
          </ul>
          <p className="commandes-count">
            {commandes.length} commande{commandes.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}
    </div>
  );
}

export default Commandes;
