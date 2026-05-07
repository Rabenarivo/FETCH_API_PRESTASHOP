import React from 'react';
import './Navbar.css';

function Navbar() {
  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-logo">
          <a href="/">Prestashop</a>
        </div>
        <ul className="nav-menu">
          <li className="nav-item">
            <a href="/" className="nav-link">Accueil</a>
          </li>
          <li className="nav-item">
            <a href="#products" className="nav-link">Produits</a>
          </li>
          <li className="nav-item">
            <a href="#about" className="nav-link">À propos</a>
          </li>
          <li className="nav-item">
            <a href="#contact" className="nav-link">Contact</a>
          </li>
        </ul>
      </div>
    </nav>
  );
}

export default Navbar;
