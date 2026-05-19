import React, { useEffect, useMemo, useState } from 'react';
import { getProducts } from '../../api/productApi';
import { addProductStock, getProductStock } from '../../api/stockAPI';
import './StockProducts.css';

function StockProducts() {
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedProductStock, setSelectedProductStock] = useState(null);
  const [loadingStock, setLoadingStock] = useState(false);

  const [quantityToAdd, setQuantityToAdd] = useState(1);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoadingProducts(true);
      setError('');
      try {
        const list = await getProducts(0);
        setProducts(list);
      } catch (e) {
        setError(e.message || 'Erreur lors du chargement des produits');
      } finally {
        setLoadingProducts(false);
      }
    };

    load();
  }, []);

  useEffect(() => {
    if (!selectedProductId) {
      setSelectedProductStock(null);
      return;
    }

    const loadStock = async () => {
      setLoadingStock(true);
      setError('');
      try {
        const stock = await getProductStock(Number(selectedProductId));
        setSelectedProductStock(stock);
      } catch (e) {
        setError(e.message || 'Erreur lors du chargement du stock');
        setSelectedProductStock(null);
      } finally {
        setLoadingStock(false);
      }
    };

    loadStock();
  }, [selectedProductId]);

  const produitsFiltres = useMemo(() => {
    const critere = String(search || '').toLowerCase().trim();
    if (!critere) return products;

    return products.filter((product) =>
      String(product.name || '').toLowerCase().includes(critere)
    );
  }, [products, search]);

  const selectedProduct = useMemo(
    () => products.find((product) => String(product.id) === String(selectedProductId)) || null,
    [products, selectedProductId]
  );

  const handleAddStock = async () => {
    if (!selectedProductId) {
      setError('Selectionnez un produit');
      return;
    }

    const qty = Number.parseInt(quantityToAdd, 10);
    if (Number.isNaN(qty) || qty < 1) {
      setError('Entrez une quantite valide (>= 1)');
      return;
    }

    setSaving(true);
    setError('');
    setSuccessMessage('');

    try {
      const result = await addProductStock(Number(selectedProductId), qty);
      setSelectedProductStock(result.newQuantity);
      setSuccessMessage(
        `${selectedProduct?.name || 'Produit'}: +${result.addedQuantity} ajoute(s). Nouveau stock: ${result.newQuantity}`
      );
      setQuantityToAdd(1);
    } catch (e) {
      setError(e.message || 'Erreur lors de la mise a jour du stock');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stock-products-container">
      <div className="stock-products-header">
        <div>
          <p className="stock-products-kicker">Gestion stock</p>
          <h2>Ajouter du stock produit</h2>
          <p className="stock-products-subtitle">
            Selectionnez un produit et ajoutez une quantite au stock disponible.
          </p>
        </div>
      </div>

      {error && (
        <div className="stock-products-alert stock-products-alert-error">
          ❌ {error}
        </div>
      )}

      {successMessage && (
        <div className="stock-products-alert stock-products-alert-success">
          ✅ {successMessage}
        </div>
      )}

      <div className="stock-products-card">
        <label htmlFor="stock-search">Rechercher un produit</label>
        <input
          id="stock-search"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nom du produit"
          className="stock-input"
          disabled={loadingProducts || saving}
        />

        <label htmlFor="stock-product-select">Produit</label>
        <select
          id="stock-product-select"
          className="stock-input"
          value={selectedProductId}
          onChange={(e) => setSelectedProductId(e.target.value)}
          disabled={loadingProducts || saving}
        >
          <option value="">-- Choisir un produit --</option>
          {produitsFiltres.map((product) => (
            <option key={product.id} value={product.id}>
              #{product.id} - {product.name}
            </option>
          ))}
        </select>

        <div className="stock-current">
          <span>Stock actuel</span>
          <strong>
            {selectedProductId
              ? (loadingStock ? 'Chargement...' : `${Number(selectedProductStock || 0).toFixed(0)} unite(s)`)
              : '-'}
          </strong>
        </div>

        <label htmlFor="stock-qty">Quantite a ajouter</label>
        <input
          id="stock-qty"
          type="number"
          min="1"
          step="1"
          value={quantityToAdd}
          onChange={(e) => setQuantityToAdd(e.target.value)}
          className="stock-input"
          disabled={saving || !selectedProductId}
        />

        <button
          type="button"
          className="stock-submit-btn"
          onClick={handleAddStock}
          disabled={saving || !selectedProductId || loadingStock}
        >
          {saving ? 'Mise a jour...' : 'Ajouter au stock'}
        </button>
      </div>
    </div>
  );
}

export default StockProducts;
