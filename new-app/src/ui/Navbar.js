import React from 'react';
import './Navbar.css';

function Navbar({ currentPage, setCurrentPage }) {
  return (
    <nav className="navbar">
      <div className="navbar-container">

        <ul className="nav-menu">
          <li className="nav-item">
            <button 
              className={`nav-link ${currentPage === 'dashboard' ? 'active' : ''}`}
              onClick={() => setCurrentPage('dashboard')}
            >
              Tableau de bord
            </button>
          </li>
          <li className="nav-item">
            <button 
              className={`nav-link ${currentPage === 'import' ? 'active' : ''}`}
              onClick={() => setCurrentPage('import')}
            >
              Import
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link ${currentPage === 'commandes' ? 'active' : ''}`}
              onClick={() => setCurrentPage('commandes')}
            >
              Commandes
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
