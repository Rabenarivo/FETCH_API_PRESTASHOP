import React from 'react';
import './Navbar.css';

function Navbar({ currentPage, setCurrentPage }) {
  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-logo">
          <a onClick={() => setCurrentPage('products')} style={{ cursor: 'pointer' }}>
            Prestashop
          </a>
        </div>
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
              className={`nav-link ${currentPage === 'import' ? 'active' : ''}`}
              onClick={() => setCurrentPage('import')}
            >
              Importer
            </button>
          </li>
        </ul>
      </div>
    </nav>
  );
}

export default Navbar;
