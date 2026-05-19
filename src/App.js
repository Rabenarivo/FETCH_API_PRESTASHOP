import React, { useMemo, useState } from 'react';
import './App.css';
import Navbar from './ui/Navbar';
import Clients from './components/front-office/Clients';
import Products from './components/front-office/Products';
import Cart from './components/front-office/Cart';
import COMANDE from './components/front-office/COMANDE';
import ImportMultiple from './components/back-office/ImportMultiple';
import ResetDatabase from './components/back-office/ResetDatabase';
import Commandes from './components/back-office/Commandes';
import Dashboard from './components/back-office/Dashboard';
import StockProducts from './components/back-office/StockProducts';
import { transfererCartAnonyme } from './api/panierAPI';
import { lireIdCartAnonyme, supprimerIdCartAnonyme } from './utils/anonymousCartUtils';

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [currentFrontPage, setCurrentFrontPage] = useState('clients');
  const [cartRefresh, setCartRefresh] = useState(0);
  const [fusionEnCours, setFusionEnCours] = useState(false);
  const [connectedCustomer, setConnectedCustomer] = useState(() => {
    const id = sessionStorage.getItem('connectedCustomerId');
    const fullName = sessionStorage.getItem('connectedCustomerName');
    return id ? { id: Number(id), fullName: fullName || '' } : null;
  });

  const pathname = useMemo(() => window.location.pathname.toLowerCase(), []);
  const isFrontOffice = pathname.startsWith('/front-office');

  const handleConnectFO = async (customer) => {
    if (!customer) {
      setConnectedCustomer(null);
      setCurrentFrontPage('clients');
      return;
    }

    if (customer.anonymous) {
      setConnectedCustomer(customer);
      setCurrentFrontPage('products');
      return;
    }

    // Connexion réelle : fusionner le panier anonyme si présent
    setConnectedCustomer(customer);
    setCurrentFrontPage('products');

    const idCartAnonyme = lireIdCartAnonyme();
    if (idCartAnonyme) {
      setFusionEnCours(true);
      try {
        await transfererCartAnonyme(idCartAnonyme, customer.id);
        supprimerIdCartAnonyme();
        setCartRefresh((r) => r + 1);
      } catch (e) {
        console.error('Erreur fusion panier anonyme :', e);
      } finally {
        setFusionEnCours(false);
      }
    }
  };

  const handleProductAdded = () => {
    setCartRefresh(r => r + 1);
  };

  return (
    <div className="App">
      {isFrontOffice ? (
        <div>
          <div className="front-top-links">
            <button type="button" onClick={() => { window.location.href = '/back-office'; }}>
              Aller au back-office
            </button>
          </div>
          
          {currentFrontPage === 'clients' && (
            <Clients onConnect={handleConnectFO} />
          )}

          {fusionEnCours && (
            <div style={{ background: '#dbeafe', color: '#1e40af', padding: '0.5rem 1rem', textAlign: 'center', fontSize: '0.9rem' }}>
              ⏳ Fusion du panier anonyme en cours…
            </div>
          )}

          {currentFrontPage === 'products' && (
            <div>
              <div className="front-page-tabs">
                <button
                  className={`tab-btn ${currentFrontPage === 'products' ? 'active' : ''}`}
                  onClick={() => setCurrentFrontPage('products')}
                >
                  📦 Produits
                </button>
                <button
                  className={`tab-btn ${currentFrontPage === 'cart' ? 'active' : ''}`}
                  onClick={() => setCurrentFrontPage('cart')}
                >
                  🛒 Panier
                </button>
                <button
                  className={`tab-btn ${currentFrontPage === 'commande' ? 'active' : ''}`}
                  onClick={() => setCurrentFrontPage('commande')}
                >
                  📄 COMANDE
                </button>
              </div>
              <Products connectedCustomer={connectedCustomer} onProductAdded={handleProductAdded} />
            </div>
          )}

          {currentFrontPage === 'cart' && (
            <div>
              <div className="front-page-tabs">
                <button
                  className={`tab-btn ${currentFrontPage === 'products' ? 'active' : ''}`}
                  onClick={() => setCurrentFrontPage('products')}
                >
                  📦 Produits
                </button>
                <button
                  className={`tab-btn ${currentFrontPage === 'cart' ? 'active' : ''}`}
                  onClick={() => setCurrentFrontPage('cart')}
                >
                  🛒 Panier
                </button>
                <button
                  className={`tab-btn ${currentFrontPage === 'commande' ? 'active' : ''}`}
                  onClick={() => setCurrentFrontPage('commande')}
                >
                  📄 COMANDE
                </button>
              </div>
              <Cart
                connectedCustomer={connectedCustomer}
                cartRefresh={cartRefresh}
                onCheckout={() => setCurrentFrontPage('commande')}
                onLoginRequired={() => setCurrentFrontPage('clients')}
              />
            </div>
          )}

          {currentFrontPage === 'commande' && (
            <div>
              <div className="front-page-tabs">
                <button
                  className={`tab-btn ${currentFrontPage === 'products' ? 'active' : ''}`}
                  onClick={() => setCurrentFrontPage('products')}
                >
                  📦 Produits
                </button>
                <button
                  className={`tab-btn ${currentFrontPage === 'cart' ? 'active' : ''}`}
                  onClick={() => setCurrentFrontPage('cart')}
                >
                  🛒 Panier
                </button>
                <button
                  className={`tab-btn ${currentFrontPage === 'commande' ? 'active' : ''}`}
                  onClick={() => setCurrentFrontPage('commande')}
                >
                  📄 COMANDE
                </button>
              </div>
              <COMANDE connectedCustomer={connectedCustomer} />
            </div>
          )}
        </div>
      ) : (
        <>
          <Navbar currentPage={currentPage} setCurrentPage={setCurrentPage} />
          {currentPage === 'dashboard' && <Dashboard />}
          {currentPage === 'commandes' && <Commandes />}
          {currentPage === 'stock' && <StockProducts />}
          {currentPage === 'import' && <ImportMultiple />}
          {currentPage === 'reset' && <ResetDatabase />}
        </>
      )}
    </div>
  );
}

export default App;
