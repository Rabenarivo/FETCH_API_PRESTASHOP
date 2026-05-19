import React, { useEffect, useState } from 'react';
import { getCustomers } from '../../api/customerApi';
import { lireIdCartAnonyme } from '../../utils/anonymousCartUtils';
import './Clients.css';

function Clients({ onConnect }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connectedId, setConnectedId] = useState(() => Number(sessionStorage.getItem('connectedCustomerId') || 0));

  useEffect(() => {
    async function fetchClients() {
      try {
        setLoading(true);
        setError('');
        const data = await getCustomers();
        setClients(data);
      } catch (e) {
        setError(e.message || 'Erreur de chargement des clients');
      } finally {
        setLoading(false);
      }
    }

    fetchClients();
  }, []);

  const handleConnect = (client) => {
    const fullName = `${client.firstname || ''} ${client.lastname || ''}`.trim();
    const payload = {
      id: client.id,
      firstname: client.firstname || '',
      lastname: client.lastname || '',
      fullName,
      email: client.email || '',
    };

    sessionStorage.setItem('connectedCustomerId', String(client.id));
    sessionStorage.setItem('connectedCustomerName', fullName);
    setConnectedId(client.id);
    onConnect(payload);

    console.log('Client connecte', payload);
  };

  const handleAnonymous = () => {
    onConnect({ id: 0, fullName: 'Visiteur', anonymous: true });
  };

  const handleDisconnect = () => {
    sessionStorage.removeItem('connectedCustomerId');
    sessionStorage.removeItem('connectedCustomerName');
    setConnectedId(0);
    onConnect(null);
    window.location.href = '/front-office';
  };

  return (
    <div className="clients-container">
      <div className="clients-header-bar">
        <h2>Gestion des Clients</h2>
        {connectedId > 0 && (
          <div className="clients-connected-info">
            <span className="connected-user-badge">
              👤 Connecté: {sessionStorage.getItem('connectedCustomerName')}
            </span>
            <button type="button" className="disconnect-btn" onClick={handleDisconnect}>
              🚪 Déconnexion
            </button>
          </div>
        )}
      </div>

      {loading && <p>Chargement...</p>}
      {!!error && <p className="clients-error">{error}</p>}

      <div className="clients-anonymous-zone">
        <p className="clients-anonymous-desc">
          Parcourez les produits et ajoutez-les au panier sans compte.
          {lireIdCartAnonyme() > 0 && (
            <span className="clients-anon-count"> (panier anonyme en attente)</span>
          )}
        </p>
        <button type="button" className="anonymous-btn" onClick={handleAnonymous}>
          👤 Continuer en tant qu&apos;anonyme
        </button>
      </div>

      {!loading && !error && (
        <ul className="clients-list">
          <li className="clients-header">
            <span>ID</span>
            <span>Nom</span>
            <span>Prenom</span>
            <span>Email</span>
            <span>Action</span>
          </li>

          {clients.map((client) => (
            <li key={client.id} className="clients-row">
              <span>{client.id}</span>
              <span>{client.lastname || '-'}</span>
              <span>{client.firstname || '-'}</span>
              <span>{client.email || '-'}</span>
              <span>
                <button
                  type="button"
                  className="connect-btn"
                  onClick={() => handleConnect(client)}
                  disabled={connectedId === client.id}
                >
                  {connectedId === client.id ? 'Connecte' : 'Se connecter'}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default Clients;
