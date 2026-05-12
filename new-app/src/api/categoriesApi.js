import {
  parsePrestaXML,
  getCollection,
  getValue,
  getLangValue,
} from '../config/parserXML';

export async function getCategories() {
  const response = await fetch('/evals/api/categories?display=[id,name]', {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Erreur lors du chargement des catégories');
  }

  const xmlText = await response.text();
  const data = parsePrestaXML(xmlText);

  // Selon la reponse PrestaShop, la liste peut etre:
  // - prestashop.category
  // - prestashop.categories.category
  const categoriesFromRoot = getCollection(data, 'category');
  const categoriesFromContainer = data?.prestashop?.categories?.category;
  const categories = categoriesFromRoot.length
    ? categoriesFromRoot
    : Array.isArray(categoriesFromContainer)
      ? categoriesFromContainer
      : categoriesFromContainer
        ? [categoriesFromContainer]
        : [];

  return categories.map((category) => ({
    id: getValue(category.id),
    name: getLangValue(category.name, 1) || `Categorie #${getValue(category.id, '')}`,
  }));
}

export async function getCategory(id) {
  const response = await fetch(`/evals/api/categories/${id}`, {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Erreur lors du chargement de la catégorie');
  }

  const xmlText = await response.text();
  const data = parsePrestaXML(xmlText);

  const category = data?.prestashop?.category;

  return {
    id: getValue(category?.id),
    name: getLangValue(category?.name, 1),
    active: getValue(category?.active),
  };
}