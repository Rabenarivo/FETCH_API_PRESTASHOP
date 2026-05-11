import { useEffect, useState } from 'react';
import { getCategories } from '../api/categoriesApi';
import './Categories.css';

export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadCategories();
  }, []);

  async function loadCategories() {
    try {
      const data = await getCategories();
      setCategories(data);
    } catch (err) {
      console.error(err);
      setError('Erreur lors du chargement des catégories');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="loading">Chargement...</div>;
  }

  if (error) {
    return (
      <div className="categories-container">
        <p className="error-message">{error}</p>
      </div>
    );
  }

  return (
    <div className="categories-container">
      <h2>
        Catégories <span className="count">({categories.length})</span>
      </h2>

      {categories.length === 0 ? (
        <p className="empty">Aucune catégorie trouvée.</p>
      ) : (
        <div className="table-wrapper">
          <table className="categories-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nom</th>
              </tr>
            </thead>

            <tbody>
              {categories.map((category) => (
                <tr key={category.id}>
                  <td>{category.id}</td>
                  <td>{category.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}