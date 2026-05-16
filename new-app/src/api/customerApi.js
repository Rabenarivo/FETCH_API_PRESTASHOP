/**
 * customerApi.js
 *
 * API simple pour charger la liste des clients.
 */

import { parsePrestaXML, getValue } from '../config/parserXML';

const API_URL = process.env.NODE_ENV === 'production'
  ? process.env.REACT_APP_PRESTASHOP_API_URL
  : '/evals/api';

const getAuthHeader = () => ({
  'Content-Type': 'application/xml',
});

const getResourceList = (data, singular, plural) => {
  // Convertit la reponse PrestaShop en tableau, meme si l'API renvoie un seul objet.
  const fromRoot = data?.prestashop?.[singular];
  if (Array.isArray(fromRoot)) return fromRoot;
  if (fromRoot) return [fromRoot];

  const fromContainer = data?.prestashop?.[plural]?.[singular];
  if (Array.isArray(fromContainer)) return fromContainer;
  if (fromContainer) return [fromContainer];

  return [];
};

export const getCustomers = async () => {
  // 1) Appel API clients
  try {
    const response = await fetch(
      `${API_URL}/customers?display=[id,firstname,lastname,email]&sort=[id_ASC]&limit=200`,
      {
        method: 'GET',
        headers: getAuthHeader(),
      }
    );

    if (!response.ok) {
      throw new Error(`API error customers: ${response.status}`);
    }

    // 2) Conversion XML -> JS
    const xmlData = await response.text();
    const data = parsePrestaXML(xmlData);
    const customers = getResourceList(data, 'customer', 'customers');

    // 3) Mapping vers un objet simple pour React
    return customers.map((customer) => ({
      id: Number(getValue(customer?.id, 0)),
      firstname: getValue(customer?.firstname, ''),
      lastname: getValue(customer?.lastname, ''),
      email: getValue(customer?.email, ''),
    }));
  } catch (error) {
    console.error('Error fetching customers:', error);
    throw error;
  }
};
