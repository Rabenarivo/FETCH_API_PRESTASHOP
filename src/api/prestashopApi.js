/**
 * prestashopApi.js
 *
 * Fichier pont (compatibilite):
 * - re-exporte les fonctions produits et clients
 * - permet de garder les anciens imports si besoin
 */

export { getProducts, getProductDetails } from './productApi';
export { getCustomers } from './customerApi';
