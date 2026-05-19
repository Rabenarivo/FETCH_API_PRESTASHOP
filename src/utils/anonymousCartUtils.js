/**
 * anonymousCartUtils.js
 *
 * Stockage de l’identifiant du panier anonyme PrestaShop en sessionStorage.
 * Le panier lui-même est dans la base de données (ps_cart).
 * Seul l’ID est conservé côté navigateur pour le retrouver.
 */

const ID_KEY = 'anonymousCartId';

/** Retourne l’ID du panier anonyme (0 si absent). */
export function lireIdCartAnonyme() {
  return Number(sessionStorage.getItem(ID_KEY) || 0);
}

/** Enregistre l’ID du panier anonyme. */
export function sauvegarderIdCartAnonyme(id) {
  sessionStorage.setItem(ID_KEY, String(id));
}

/** Supprime l’ID du panier anonyme de la session. */
export function supprimerIdCartAnonyme() {
  sessionStorage.removeItem(ID_KEY);
}

