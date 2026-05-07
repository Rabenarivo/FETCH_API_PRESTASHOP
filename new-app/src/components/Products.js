import React, { useState, useEffect } from 'react';
import { getProducts, getProductDetails } from '../api/prestashopApi';
import './Products.css';

function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productDetails, setProductDetails] = useState(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getProducts();
      setProducts(data);
    } catch (err) {
      setError(err.message || 'Erreur lors du chargement des produits');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleProductClick = async (productId) => {
    try {
      setLoading(true);
      const details = await getProductDetails(productId);
      setProductDetails(details);
      setSelectedProduct(productId);
    } catch (err) {
      setError(err.message || 'Erreur lors du chargement des détails');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const closeDetails = () => {
    setSelectedProduct(null);
    setProductDetails(null);
  };

  if (error) {
    return (
      <div className="products-container">
        <div className="error-message">
          <p>❌ Erreur: {error}</p>
          <button onClick={fetchProducts} className="retry-btn">
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="products-container" id="products">
      <h2>Nos Produits</h2>
      
      {loading ? (
        <div className="loading">
          <p>Chargement des produits...</p>
        </div>
      ) : (
        <>
          <div className="products-grid">
            {products && products.length > 0 ? (
              products.map((product) => (
                <div 
                  key={product.id} 
                  className="product-card"
                  onClick={() => handleProductClick(product.id)}
                >
                  <div className="product-id">#ID: {product.id}</div>
                  <div className="product-title">Produit {product.id}</div>
                  <div className="product-link">
                    <a href={product.href} target="_blank" rel="noopener noreferrer">
                      Voir les détails
                    </a>
                  </div>
                </div>
              ))
            ) : (
              <p>Aucun produit trouvé</p>
            )}
          </div>

          {selectedProduct && productDetails && (
            <div className="modal-overlay" onClick={closeDetails}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>Détails du Produit</h3>
                  <button className="close-btn" onClick={closeDetails}>✕</button>
                </div>
                <div className="modal-body">
                  <pre>{JSON.stringify(productDetails, null, 2)}</pre>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Products;
