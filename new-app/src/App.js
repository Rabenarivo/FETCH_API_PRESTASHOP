import React, { useState } from 'react';
import './App.css';
import Navbar from './ui/Navbar';
import Products from './components/front-office/Products';
import Categories from './components/back-office/Categories';
import ImportMultiple from './components/back-office/ImportMultiple';
import ResetDatabase from './components/back-office/ResetDatabase';
import Commandes from './components/back-office/Commandes';
import Dashboard from './components/back-office/Dashboard';

function App() {
  const [currentPage, setCurrentPage] = useState('products');

  return (
    <div className="App">
      <Navbar currentPage={currentPage} setCurrentPage={setCurrentPage} />
      {currentPage === 'dashboard' && <Dashboard />}
      {currentPage === 'products' && <Products />}
      {currentPage === 'categories' && <Categories />}
      {currentPage === 'commandes' && <Commandes />}
      {currentPage === 'import' && <ImportMultiple />}
      {currentPage === 'reset' && <ResetDatabase />}
    </div>
  );
}

export default App;
