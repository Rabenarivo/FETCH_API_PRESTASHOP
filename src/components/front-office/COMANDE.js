import React, { useEffect, useState } from 'react';
import {
  chargerResumeCommandeClient,
  validerCommandePaiementLivraison,
} from '../../api/commandeCLIENTAPI';
import './COMANDE.css';

function COMANDE({ connectedCustomer }) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resume, setResume] = useState(null);

  useEffect(() => {
    chargerResume();
  }, [connectedCustomer?.id]);

  const chargerResume = async () => {
    if (!connectedCustomer?.id) {
      setResume(null);
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccess('');
      const data = await chargerResumeCommandeClient(connectedCustomer.id);
      setResume(data);
    } catch (err) {
      setError(err.message || 'Erreur de chargement de la commande');
    } finally {
      setLoading(false);
    }
  };

  const handleValiderCommande = async () => {
    if (!connectedCustomer?.id) return;

    try {
      setSubmitting(true);
      setError('');
      setSuccess('');

      const resultat = await validerCommandePaiementLivraison(connectedCustomer.id);
      setSuccess(
        `Commande #${resultat.idOrder} creee avec succes (${resultat.modePaiement})`
      );
      await chargerResume();
    } catch (err) {
      setError(err.message || 'Erreur pendant la validation de la commande');
    } finally {
      setSubmitting(false);
    }
  };

  if (!connectedCustomer?.id) {
    return (
      <div className="commande-container">
        <h2>COMANDE</h2>
        <p className="commande-empty">Veuillez vous connecter avant de valider une commande.</p>
      </div>
    );
  }

  return (
    <div className="commande-container">
      <h2>COMANDE</h2>
      <p className="commande-customer">Client: {connectedCustomer.fullName || `#${connectedCustomer.id}`}</p>

      {loading && <p className="commande-loading">Chargement du recapitulatif...</p>}
      {error && <div className="commande-error">{error}</div>}
      {success && <div className="commande-success">{success}</div>}

      {!loading && resume && (
        <div className="commande-card">
          <p>
            <strong>ID panier:</strong> {resume.idCart}
          </p>
          <p>
            <strong>Mode de paiement:</strong> {resume.modePaiement}
          </p>
          <p>
            <strong>Produits:</strong> {resume.produits.length}
          </p>
          <p>
            <strong>Quantite totale:</strong> {resume.quantiteTotale}
          </p>
          <p>
            <strong>Total TTC:</strong> {Number(resume.totalTtc || 0).toFixed(2)} Ar
          </p>

          <button
            type="button"
            className="commande-btn"
            onClick={handleValiderCommande}
            disabled={submitting || !resume.produits.length}
          >
            {submitting ? 'Validation en cours...' : 'Valider (Paiement a la livraison)'}
          </button>
        </div>
      )}
    </div>
  );
}

export default COMANDE;
