import React from 'react';
import './Navbar.css';

function Navbar({ currentPage, setCurrentPage }) {
  return (
    <nav className="navbar">
      <div className="navbar-container">
        <button
          className="navbar-logo-btn"
          onClick={() => setCurrentPage('products')}
          type="button"
        >
          Prestashop
        </button>
        <ul className="nav-menu">
          <li className="nav-item">
            <button 
              className={`nav-link ${currentPage === 'products' ? 'active' : ''}`}
              onClick={() => setCurrentPage('products')}
            >
              Produits
            </button>
          </li>
          <li className="nav-item">
            <button 
              className={`nav-link ${currentPage === 'importFichier1Test' ? 'active' : ''}`}
              onClick={() => setCurrentPage('importFichier1Test')}
            >
              Test Import Fichier 1
            </button>
          </li>
          <li className="nav-item">
            <button 
              className={`nav-link ${currentPage === 'categories' ? 'active' : ''}`}
              onClick={() => setCurrentPage('categories')}
            >
              Categories
            </button>
          </li>
          <li className="nav-item">
            <button 
              className={`nav-link ${currentPage === 'reset' ? 'active' : ''}`}
              onClick={() => setCurrentPage('reset')}
            >
              Reinitialiser
            </button>
          </li>
        </ul>
      </div>
    </nav>
  );
}

export default Navbar;
