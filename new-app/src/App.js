import React, { useState } from 'react';
import './App.css';
import Navbar from './ui/Navbar';
import Products from './components/Products';
import ProductImporter from './components/import';

function App() {
  const [currentPage, setCurrentPage] = useState('products');

  return (
    <div className="App">
      <Navbar currentPage={currentPage} setCurrentPage={setCurrentPage} />
      {currentPage === 'products' && <Products />}
      {currentPage === 'import' && <ProductImporter />}
    </div>
  );
}

export default App;
