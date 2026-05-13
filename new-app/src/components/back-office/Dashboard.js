import React, { useEffect, useMemo, useState } from 'react';
import { listerCommandes } from '../../api/commandeAPI';
import './Dashboard.css';

const formatterMontant = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function extraireJour(dateAjout) {
  if (!dateAjout) return '';
  return String(dateAjout).slice(0, 10);
}

function formatJour(jour) {
  if (!jour) return 'Date inconnue';
  const date = new Date(`${jour}T00:00:00`);
  if (Number.isNaN(date.getTime())) return jour;
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function Dashboard() {
  const [commandes, setCommandes] = useState([]);
  const [dateFiltre, setDateFiltre] = useState('');
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    const charger = async () => {
      setChargement(true);
      setErreur('');
      try {
        const liste = await listerCommandes();
        setCommandes(liste);

        if (!dateFiltre && liste.length) {
          const joursDisponibles = [...new Set(liste.map((commande) => extraireJour(commande.dateAjout)).filter(Boolean))]
            .sort((a, b) => b.localeCompare(a));
          setDateFiltre(joursDisponibles[0] || '');
        }
      } catch (e) {
        setErreur(e.message || 'Erreur lors du chargement du tableau de bord');
      } finally {
        setChargement(false);
      }
    };

    charger();
  }, []);

  const dateAffichage = dateFiltre ? formatJour(dateFiltre) : 'Toutes les dates';

  const dateMax = useMemo(() => {
    if (!commandes.length) return '';
    return commandes.reduce((latest, commande) => {
      const jour = extraireJour(commande.dateAjout);
      return jour && (!latest || jour > latest) ? jour : latest;
    }, '');
  }, [commandes]);

  const commandesFiltrees = useMemo(() => {
    if (!dateFiltre) return commandes;
    return commandes.filter((commande) => extraireJour(commande.dateAjout) === dateFiltre);
  }, [commandes, dateFiltre]);

  const totalMontant = commandesFiltrees.reduce((somme, commande) => somme + Number(commande.total || 0), 0);

  const nbCommandes = commandesFiltrees.length;

  return (
    <div className="dashboard-container">
      <div className="dashboard-hero">
        <div>
          <p className="dashboard-kicker">Vue synthétique</p>
          <h2>Tableau de bord</h2>
          <p className="dashboard-subtitle">Filtre par date pour suivre le volume de commandes et le montant encaissé.</p>
        </div>

        <div className="dashboard-filter">
          <label htmlFor="dashboard-date-filter">Filtre date</label>
          <input
            id="dashboard-date-filter"
            value={dateFiltre}
            onChange={(e) => setDateFiltre(e.target.value)}
            type="date"
            max={dateMax}
            disabled={chargement || commandes.length === 0}
          />
        </div>
      </div>

      {erreur && (
        <div className="dashboard-error">
          <p>❌ {erreur}</p>
        </div>
      )}

      <div className="dashboard-metrics">
        <article className="metric-card metric-primary">
          <span className="metric-label">Nombre de commandes</span>
          <strong className="metric-value">{chargement ? '…' : nbCommandes}</strong>
        </article>
        <article className="metric-card metric-secondary">
          <span className="metric-label">Montant total</span>
          <strong className="metric-value">{chargement ? '…' : `${formatterMontant.format(totalMontant)} Ar`}</strong>
        </article>
      </div>

      {!erreur && !chargement && (
        <div className="dashboard-detail">
          <div>
            <h3>{dateAffichage}</h3>
            <p>
              {nbCommandes} commande{nbCommandes !== 1 ? 's' : ''} pour cette journée.
            </p>
          </div>

          <div className="dashboard-total-box">
            <span>Montant du jour</span>
            <strong>{formatterMontant.format(totalMontant)} Ar</strong>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;