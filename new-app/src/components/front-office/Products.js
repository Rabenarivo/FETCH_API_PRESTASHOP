import React, { useState, useEffect } from 'react';
import { getProducts } from '../../api/prestashopApi';
import './Products.css';

function Products() {
  const [products, setProducts] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setError(null);
      const data = await getProducts();
      setProducts(data);
    } catch (err) {
      setError(err.message || 'Erreur lors du chargement des produits');
      console.error(err);
    }
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

      <div className="products-list-wrap">
        {products && products.length > 0 ? (
          <ul className="products-list">
            <li className="products-list-header">
              <span>ID</span>
              <span>Nom</span>
              <span>Prix TTC</span>
              <span>Prix HT</span>
              <span>Prix Achat</span>
              <span>Taxes</span>
            </li>
            {products.map((product) => (
              <li
                key={product.id}
                className="product-row"
              >
                <span>{product.id}</span>
                <span>{product.name}</span>
                <span>{Number(product.prix_ttc || 0).toFixed(2)} Ar</span>
                <span>{Number(product.prix_ht || product.price || 0).toFixed(2)} Ar</span>
                <span>{Number(product.prix_achat || 0).toFixed(2)} Ar</span>
                <span>{Number(product.taxes || 0).toFixed(3)}%</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>Aucun produit trouvé</p>
        )}
      </div>
    </div>
  );
}

export default Products;
