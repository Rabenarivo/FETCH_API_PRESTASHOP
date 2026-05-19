import React, { useState, useEffect, useCallback } from 'react';
import { getProducts, getProductStock } from '../../api/productApi';
import {
  obtenirOuCreerPanierClient,
  ajouterProduitCart,
  creerPanierAnonyme,
  ajouterProduitCartAnonyme,
} from '../../api/panierAPI';
import { lireIdCartAnonyme, sauvegarderIdCartAnonyme } from '../../utils/anonymousCartUtils';
import Fiche from './Fiche';
import './Products.css';

const normaliserTexte = (valeur = '') =>
  String(valeur)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const UNE_JOURNEE_MS = 24 * 60 * 60 * 1000;
const UNE_SEMAINE_MS = 7 * UNE_JOURNEE_MS;

const obtenirMarqueProduit = (dateAvailability) => {
  if (!dateAvailability) {
    return null;
  }

  const dateSortie = new Date(dateAvailability).getTime();
  if (Number.isNaN(dateSortie)) {
    return null;
  }

  const maintenant = Date.now();
  const ecartMs = maintenant - dateSortie;

  if (ecartMs < 0) {
    return null;
  }

  if (ecartMs <= UNE_JOURNEE_MS) {
    return 'HOT';
  }

  if (ecartMs <= UNE_SEMAINE_MS) {
    return 'NEW';
  }

  return null;
};

function Products({ connectedCustomer, onProductAdded }) {
  const [products, setProducts] = useState([]);
  const [error, setError] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedFicheProduct, setSelectedFicheProduct] = useState(null);
  const [selectedStock, setSelectedStock] = useState(0);
  const [stockLoading, setStockLoading] = useState(false);
  const [nomRecherche, setNomRecherche] = useState('');
  const [categorieRecherche, setCategorieRecherche] = useState('');
  const [prixMinRecherche, setPrixMinRecherche] = useState('');
  const [prixMaxRecherche, setPrixMaxRecherche] = useState('');

  const fetchProducts = useCallback(async () => {
    try {
      setError(null);
      const data = await getProducts(connectedCustomer?.id || 0);
      setProducts(data);
    } catch (err) {
      setError(err.message || 'Erreur lors du chargement des produits');
      console.error(err);
    }
  }, [connectedCustomer?.id]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleQuantityChange = (productId, value) => {
    const parsed = Number.parseInt(value, 10);
    const safeQty = Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
    setQuantities((previous) => ({
      ...previous,
      [productId]: safeQty,
    }));
  };

  const categoriesDisponibles = Array.from(
    new Set(products.map((p) => p.category_name || 'Sans categorie'))
  ).sort((a, b) => a.localeCompare(b));

  const filteredProducts = products.filter((product) => {
    const nomOk = !nomRecherche
      || normaliserTexte(product.name).includes(normaliserTexte(nomRecherche));

    const categorieOk = !categorieRecherche
      || (product.category_name || 'Sans categorie') === categorieRecherche;

    const prixTtc = Number(product.prix_ttc || 0);
    const prixMin = Number.parseFloat(String(prixMinRecherche).replace(',', '.'));
    const prixMax = Number.parseFloat(String(prixMaxRecherche).replace(',', '.'));

    const prixMinOk = Number.isNaN(prixMin) || prixTtc >= prixMin;
    const prixMaxOk = Number.isNaN(prixMax) || prixTtc <= prixMax;

    return nomOk && categorieOk && prixMinOk && prixMaxOk;
  });

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

  const handleOpenFiche = (product) => {
    setSelectedFicheProduct(product);
  };

  const handleValidate = async (product) => {
    if (!connectedCustomer?.id && !connectedCustomer?.anonymous) {
      alert('Veuillez vous connecter pour ajouter des produits');
      return;
    }

    // Utilisateur anonyme : créer/réutiliser le panier PrestaShop sans client
    if (connectedCustomer?.anonymous) {
      const quantite = parseInt(quantities[product.id] || 1, 10);
      if (quantite < 1) { alert('Quantité invalide'); return; }
      try {
        // Récupérer ou créer le panier anonyme en base
        let idCart = lireIdCartAnonyme();
        if (!idCart) {
          idCart = await creerPanierAnonyme();
          sauvegarderIdCartAnonyme(idCart);
        }
        await ajouterProduitCartAnonyme(idCart, product.id, 0, quantite);
        alert(`✓ ${product.name} (x${quantite}) ajouté au panier`);
        setQuantities({ ...quantities, [product.id]: 1 });
        if (typeof onProductAdded === 'function') onProductAdded();
      } catch (err) {
        console.error(err);
        alert(`❌ Erreur: ${err.message}`);
      }
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
      {connectedCustomer?.anonymous && (
        <div className="products-anonymous-banner">
          👤 Mode anonyme — vos articles sont sauvegardés localement.
          Connectez-vous via <strong>Clients</strong> pour finaliser votre commande.
        </div>
      )}
      <p className="connected-user-line">
        Utilisateur connecte: {connectedCustomer ? `${connectedCustomer.fullName || ''} (id: ${connectedCustomer.id})` : 'Aucun'}
      </p>

      <div className="products-filters">
        <input
          type="text"
          className="filter-input"
          placeholder="Rechercher par nom"
          value={nomRecherche}
          onChange={(e) => setNomRecherche(e.target.value)}
        />

        <select
          className="filter-input"
          value={categorieRecherche}
          onChange={(e) => setCategorieRecherche(e.target.value)}
        >
          <option value="">Toutes les categories</option>
          {categoriesDisponibles.map((categorie) => (
            <option key={categorie} value={categorie}>{categorie}</option>
          ))}
        </select>

        <input
          type="number"
          min="0"
          step="0.01"
          className="filter-input"
          placeholder="Prix min (TTC)"
          value={prixMinRecherche}
          onChange={(e) => setPrixMinRecherche(e.target.value)}
        />

        <input
          type="number"
          min="0"
          step="0.01"
          className="filter-input"
          placeholder="Prix max (TTC)"
          value={prixMaxRecherche}
          onChange={(e) => setPrixMaxRecherche(e.target.value)}
        />
      </div>

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
        {filteredProducts && filteredProducts.length > 0 ? (
          <ul className="products-list">
            <li className="products-list-header">
              <span>Nom</span>
              <span>Catégorie</span>
              <span>Prix TTC</span>
              <span>Marque</span>
              <span>Fiche produit</span>
            </li>
            {filteredProducts.map((product) => {
              const marqueProduit = obtenirMarqueProduit(product.date_availability_produit);

              return (
                <li
                  key={product.id}
                  className="product-row"
                  onClick={() => handleSelectProduct(product)}
                >
                  <span>{product.name}</span>
                  <span>{product.category_name || 'Sans catégorie'}</span>
                  <span>{Number(product.prix_ttc || 0).toFixed(2)} Ar</span>
                  <span>
                    {marqueProduit && (
                      <span className={`product-badge ${marqueProduit === 'HOT' ? 'product-badge-hot' : 'product-badge-new'}`}>
                        {marqueProduit}
                      </span>
                    )}
                  </span>
                  <span>
                    <button
                      type="button"
                      className="fiche-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleOpenFiche(product);
                      }}
                    >
                      Fiche produit
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p>Aucun produit ne correspond aux criteres</p>
        )}
      </div>

      {selectedFicheProduct && (
        <Fiche
          product={selectedFicheProduct}
          onClose={() => setSelectedFicheProduct(null)}
        />
      )}
    </div>
  );
}

export default Products;
