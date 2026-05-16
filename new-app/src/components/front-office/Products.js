import React, { useState, useEffect } from 'react';
import { getProducts, getProductStock } from '../../api/productApi';
import { obtenirOuCreerPanierClient, ajouterProduitCart } from '../../api/panierAPI';
import './Products.css';

function Products({ connectedCustomer, onProductAdded }) {
  const [products, setProducts] = useState([]);
  const [error, setError] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedStock, setSelectedStock] = useState(0);
  const [stockLoading, setStockLoading] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, [connectedCustomer?.id]);

  const fetchProducts = async () => {
    try {
      setError(null);
      const data = await getProducts(connectedCustomer?.id || 0);
      setProducts(data);
    } catch (err) {
      setError(err.message || 'Erreur lors du chargement des produits');
      console.error(err);
    }
  };

  const handleQuantityChange = (productId, value) => {
    const parsed = Number.parseInt(value, 10);
    const safeQty = Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
    setQuantities((previous) => ({
      ...previous,
      [productId]: safeQty,
    }));
  };

  const getTotalPrice = (product) => {
    const quantity = quantities[product.id] || 1;
    const prixUnitaire = Number(product.prix_ttc || 0);
    return prixUnitaire * quantity;
  };

  const handleSelectProduct = async (product) => {
    setSelectedProduct(product);
    setStockLoading(true);
    try {
      const stock = await getProductStock(product.id);
      setSelectedStock(stock);
    } catch {
      setSelectedStock(0);
    } finally {
      setStockLoading(false);
    }
  };

  const handleValidate = async (product) => {
    if (!connectedCustomer?.id) {
      alert('Veuillez vous connecter pour ajouter des produits');
      return;
    }

    try {
      const quantite = parseInt(quantities[product.id] || 1, 10);
      if (quantite < 1) {
        alert('Quantité invalide');
        return;
      }

      // Obtenir le panier courant
      const cartData = await obtenirOuCreerPanierClient(connectedCustomer.id);

      // Ajouter le produit sur ce panier
      await ajouterProduitCart(cartData.id, product.id, 0, quantite, connectedCustomer.id);

      alert(`✓ ${product.name} (x${quantite}) ajouté au panier`);
      setQuantities({ ...quantities, [product.id]: 1 });

      // Notifier le parent pour rafraîchir le Cart
      if (typeof onProductAdded === 'function') {
        onProductAdded();
      }
    } catch (err) {
      console.error(err);
      alert(`❌ Erreur: ${err.message}`);
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
      <p className="connected-user-line">
        Utilisateur connecte: {connectedCustomer ? `${connectedCustomer.fullName || ''} (id: ${connectedCustomer.id})` : 'Aucun'}
      </p>

      {selectedProduct && (
        <div className="product-detail-card">
          <h3>Détail produit</h3>
          <p><strong>ID:</strong> {selectedProduct.id}</p>
          <p><strong>Nom:</strong> {selectedProduct.name}</p>
          <p><strong>Prix TTC:</strong> {Number(selectedProduct.prix_ttc || 0).toFixed(2)} Ar</p>
          <p>
            <strong>Stock:</strong> {stockLoading ? 'Chargement...' : `${Number(selectedStock).toFixed(0)} unité(s)`}
          </p>

          <div className="detail-actions">
            <label htmlFor="selected-product-qty"><strong>Quantité:</strong></label>
            <input
              id="selected-product-qty"
              type="number"
              min="1"
              value={quantities[selectedProduct.id] || 1}
              onChange={(e) => handleQuantityChange(selectedProduct.id, e.target.value)}
              className="qty-input"
            />
            <button
              type="button"
              className="validate-btn"
              onClick={() => handleValidate(selectedProduct)}
              disabled={stockLoading}
            >
              Ajouter au panier
            </button>
          </div>
        </div>
      )}

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
              <span>Total</span>
              <span>Détail</span>
            </li>
            {products.map((product) => (
              <li
                key={product.id}
                className="product-row"
                onClick={() => handleSelectProduct(product)}
              >
                <span>{product.id}</span>
                <span>{product.name}</span>
                <span>{Number(product.prix_ttc || 0).toFixed(2)} Ar</span>
                <span>{Number(product.prix_ht || product.price || 0).toFixed(2)} Ar</span>
                <span>{Number(product.prix_achat || 0).toFixed(2)} Ar</span>
                <span>{Number(product.taxes || 0).toFixed(3)}%</span>
                <span>{getTotalPrice(product).toFixed(2)} Ar</span>
                <span>{selectedProduct?.id === product.id ? 'Sélectionné' : 'Cliquer'}</span>
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
