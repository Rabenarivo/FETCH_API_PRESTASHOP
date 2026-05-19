import React, { useEffect, useState } from 'react';
import {
  obtenirOuCreerPanierClient,
  afficherPanierComplet,
  viderPanier,
  supprimerProduitCart,
  supprimerProduitCartAnonyme,
} from '../../api/panierAPI';
import {
  lireIdCartAnonyme,
  supprimerIdCartAnonyme,
} from '../../utils/anonymousCartUtils';
import './Cart.css';

function Cart({ connectedCustomer, cartRefresh, onCheckout, onLoginRequired }) {
  const [panier, setPanier] = useState(null);
  const [produits, setProduits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    chargerPanier();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedCustomer?.id, connectedCustomer?.anonymous, cartRefresh]);

  const chargerPanier = async () => {
    // Mode anonyme : charger depuis l'API PrestaShop via l'ID stocké en session
    if (connectedCustomer?.anonymous) {
      const idCart = lireIdCartAnonyme();
      if (!idCart) {
        setPanier(null);
        setProduits([]);
        return;
      }
      try {
        setLoading(true);
        setError('');
        setSuccessMsg('');
        const contenu = await afficherPanierComplet(idCart);
        setPanier(contenu.panier);
        setProduits(contenu.produits);
      } catch (err) {
        setError(err.message || 'Erreur chargement panier anonyme');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!connectedCustomer?.id) {
      setPanier(null);
      setProduits([]);
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccessMsg('');

      const cartData = await obtenirOuCreerPanierClient(connectedCustomer.id);
      const contenuPanier = await afficherPanierComplet(cartData.id);

      setPanier(contenuPanier.panier);
      setProduits(contenuPanier.produits);
    } catch (err) {
      setError(err.message || 'Erreur lors du chargement du panier');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSupprimer = async (idProduct, idAttribute) => {
    // Suppression dans panier anonyme
    if (connectedCustomer?.anonymous) {
      const idCart = lireIdCartAnonyme();
      if (!idCart) return;
      try {
        setError('');
        setSuccessMsg('');
        const nouvelIdCart = await supprimerProduitCartAnonyme(idCart, idProduct, idAttribute);
        if (!nouvelIdCart) supprimerIdCartAnonyme();
        setSuccessMsg('Produit supprimé du panier');
        await chargerPanier();
      } catch (err) {
        setError(err.message || 'Erreur lors de la suppression');
      }
      return;
    }

    if (!panier?.id) return;

    try {
      setError('');
      setSuccessMsg('');
      await supprimerProduitCart(panier.id, idProduct, idAttribute);
      setSuccessMsg(`Produit supprimé du panier`);
      await chargerPanier();
    } catch (err) {
      setError(err.message || 'Erreur lors de la suppression');
    }
  };

  const handleViderPanier = async () => {
    if (!window.confirm('Êtes-vous sûr de vouloir vider le panier ?')) return;

    // Vider panier anonyme
    if (connectedCustomer?.anonymous) {
      const idCart = lireIdCartAnonyme();
      if (!idCart) return;
      try {
        setError('');
        setSuccessMsg('');
        await viderPanier(idCart);
        supprimerIdCartAnonyme();
        setSuccessMsg('Panier vidé');
        await chargerPanier();
      } catch (err) {
        setError(err.message || 'Erreur lors du vidage du panier');
      }
      return;
    }

    if (!panier?.id) return;

    try {
      setError('');
      setSuccessMsg('');
      await viderPanier(panier.id);
      setSuccessMsg('Panier vidé');
      await chargerPanier();
    } catch (err) {
      setError(err.message || 'Erreur lors du vidage du panier');
    }
  };

  if (!connectedCustomer?.id && !connectedCustomer?.anonymous) {
    return (
      <div className="cart-container">
        <h2>Mon Panier</h2>
        <p className="cart-empty-msg">Veuillez vous connecter pour voir votre panier</p>
      </div>
    );
  }

  return (
    <div className="cart-container">
      <h2>Mon Panier</h2>

      {connectedCustomer?.anonymous && (
        <div className="cart-anon-banner">
          👤 Panier anonyme — connectez-vous pour finaliser votre commande.
        </div>
      )}

      {loading && <p className="cart-loading">Chargement du panier...</p>}

      {error && <div className="cart-error">{error}</div>}
      {successMsg && <div className="cart-success">{successMsg}</div>}

      {!loading && panier && (
        <>
          <div className="cart-summary">
            <p>
              <strong>ID panier:</strong> {panier.id}
            </p>
            <p>
              <strong>Articles:</strong> {produits.length} produit{produits.length !== 1 ? 's' : ''}
            </p>
            <p>
              <strong>Quantité totale:</strong> {produits.reduce((sum, p) => sum + p.quantity, 0)}
            </p>
            <p className="cart-total">
              <strong>Total HT:</strong> {Number(produits.reduce((sum, p) => sum + p.total_ht, 0).toFixed(2))} Ar
            </p>
            <p className="cart-total">
              <strong>Total TTC:</strong> {Number(produits.reduce((sum, p) => sum + p.total_ttc, 0).toFixed(2))} Ar
            </p>
          </div>

          {produits.length > 0 ? (
            <>
              <table className="cart-products-table">
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th>Prix Unitaire</th>
                    <th>Quantité</th>
                    <th>Total HT</th>
                    <th>Total TTC</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {produits.map((produit, idx) => (
                    <tr key={`${produit.id_product}-${produit.id_product_attribute}-${idx}`}>
                      <td>{produit.name}</td>
                      <td>{Number(produit.prix_unitaire_ttc).toFixed(2)} Ar</td>
                      <td>{produit.quantity}</td>
                      <td>{Number(produit.total_ht).toFixed(2)} Ar</td>
                      <td>{Number(produit.total_ttc).toFixed(2)} Ar</td>
                      <td>
                        <button
                          type="button"
                          className="cart-btn-remove"
                          onClick={() =>
                            handleSupprimer(produit.id_product, produit.id_product_attribute)
                          }
                        >
                          ✕ Supprimer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="cart-actions">
                <button type="button" className="cart-btn-clear" onClick={handleViderPanier}>
                  🗑️ Vider le panier
                </button>
                {connectedCustomer?.anonymous ? (
                  <button
                    type="button"
                    className="cart-btn-checkout"
                    onClick={() => typeof onLoginRequired === 'function' && onLoginRequired()}
                  >
                    🔐 Se connecter pour valider
                  </button>
                ) : (
                  <button
                    type="button"
                    className="cart-btn-checkout"
                    onClick={onCheckout}
                    disabled={!produits.length}
                  >
                    ✓ Valider la commande
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className="cart-empty-msg">Votre panier est vide</p>
          )}
        </>
      )}
    </div>
  );
}

export default Cart;
