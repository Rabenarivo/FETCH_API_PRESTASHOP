import React, { useEffect, useState } from 'react';
import { getProductDetails, getProductStock } from '../../api/productApi';
import { getLangValue, getValue } from '../../config/parserXML';
import './Fiche.css';

function Fiche({ product, onClose }) {
  const [details, setDetails] = useState(null);
  const [stock, setStock] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const chargerFiche = async () => {
      if (!product?.id) return;

      try {
        setLoading(true);
        setError('');

        const [productDetails, productStock] = await Promise.all([
          getProductDetails(product.id),
          getProductStock(product.id),
        ]);

        if (cancelled) return;

        setDetails(productDetails);
        setStock(productStock);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Erreur lors du chargement de la fiche produit');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    chargerFiche();

    return () => {
      cancelled = true;
    };
  }, [product?.id]);

  if (!product) return null;

  const description = getLangValue(details?.description, 1)
    || getLangValue(details?.description_short, 1)
    || '';

  return (
    <section className="fiche-card">
      <div className="fiche-card-header">
        <div>
          <p className="fiche-kicker">Fiche produit</p>
          <h3>{product.name}</h3>
        </div>
        <button type="button" className="fiche-close-btn" onClick={onClose}>
          Fermer
        </button>
      </div>

      {loading && <p className="fiche-status">Chargement de la fiche...</p>}
      {error && <p className="fiche-error">{error}</p>}

      {!loading && !error && (
        <div className="fiche-grid">
          <div className="fiche-meta">
            <p><strong>ID:</strong> {product.id}</p>
            <p><strong>Référence:</strong> {String(getValue(details?.reference, product.reference || '')) || '--'}</p>
            <p><strong>Prix TTC:</strong> {Number(product.prix_ttc || 0).toFixed(2)} Ar</p>
            <p><strong>Prix HT:</strong> {Number(product.prix_ht || product.price || 0).toFixed(2)} Ar</p>
            <p><strong>Prix achat:</strong> {Number(product.prix_achat || 0).toFixed(2)} Ar</p>
            <p><strong>Taxes:</strong> {Number(product.taxes || 0).toFixed(3)}%</p>
            <p><strong>Stock:</strong> {Number(stock).toFixed(0)} unité(s)</p>
            <p><strong>Catégorie:</strong> {product.category_name || 'Sans categorie'}</p>
          </div>

          <div className="fiche-description">
            <h4>Description</h4>
            <p>{description ? description : 'Aucune description disponible'}</p>
          </div>
        </div>
      )}
    </section>
  );
}

export default Fiche;