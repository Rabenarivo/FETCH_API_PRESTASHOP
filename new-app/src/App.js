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

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [currentFrontPage, setCurrentFrontPage] = useState('clients');
  const [cartRefresh, setCartRefresh] = useState(0);
  const [connectedCustomer, setConnectedCustomer] = useState(() => {
    const id = sessionStorage.getItem('connectedCustomerId');
    const fullName = sessionStorage.getItem('connectedCustomerName');
    return id ? { id: Number(id), fullName: fullName || '' } : null;
  });

  const pathname = useMemo(() => window.location.pathname.toLowerCase(), []);
  const isFrontOffice = pathname.startsWith('/front-office');

  const handleConnectFO = (customer) => {
    setConnectedCustomer(customer);
    setCurrentFrontPage('products');
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
          {currentPage === 'import' && <ImportMultiple />}
          {currentPage === 'reset' && <ResetDatabase />}
        </>
      )}
    </div>
  );
}

export default App;
