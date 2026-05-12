import React, { useState } from 'react';
import './App.css';
import Navbar from './ui/Navbar';
import Products from './components/Products';
import Categories from './components/Categories';
import ImportFichier1Test from './components/ImportFichier1Test';
import ImportFichier2Test from './components/ImportFichier2Test';
import ImportFichier3Test from './components/ImportFichier3Test';
import ResetDatabase from './components/ResetDatabase';

function App() {
  const [currentPage, setCurrentPage] = useState('products');

  return (
    <div className="App">
      <Navbar currentPage={currentPage} setCurrentPage={setCurrentPage} />
      {currentPage === 'products' && <Products />}
      {currentPage === 'categories' && <Categories />}
      {currentPage === 'importFichier1Test' && <ImportFichier1Test />}
      {currentPage === 'importFichier2Test' && <ImportFichier2Test />}
      {currentPage === 'importFichier3Test' && <ImportFichier3Test />}
      {currentPage === 'reset' && <ResetDatabase />}
    </div>
  );
}

export default App;
