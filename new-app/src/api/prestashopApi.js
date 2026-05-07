// Prestashop API service

// Use local proxy in development, full URL in production
const API_URL = process.env.NODE_ENV === 'production' 
  ? process.env.REACT_APP_PRESTASHOP_API_URL 
  : '/evals/api';

const getAuthHeader = () => {
  return {
    'Content-Type': 'application/xml'
  };
};

// Parse XML to JavaScript object using native DOMParser
const parseXML = (xmlString) => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
  
  if (xmlDoc.getElementsByTagName('parsererror').length) {
    throw new Error('Invalid XML');
  }
  
  return xmlToJSON(xmlDoc);
};

// Convert XML DOM to JSON object
const xmlToJSON = (node) => {
  const obj = {};
  
  // Add attributes with namespace handling
  if (node.attributes && node.attributes.length) {
    for (let attr of node.attributes) {
      // Handle namespaced attributes (xlink:href becomes href)
      let attrName = attr.name;
      if (attrName.includes(':')) {
        attrName = attrName.split(':')[1];
      }
      obj[attrName] = attr.value;
    }
  }
  
  // Process all child elements
  for (let child of node.childNodes) {
    // Skip text nodes and comments
    if (child.nodeType !== 1) continue;
    
    const nodeName = child.nodeName.toLowerCase();
    const childValue = xmlToJSON(child);
    
    if (obj[nodeName]) {
      if (!Array.isArray(obj[nodeName])) {
        obj[nodeName] = [obj[nodeName]];
      }
      obj[nodeName].push(childValue);
    } else {
      obj[nodeName] = childValue;
    }
  }
  
  // Get text content if no children elements
  if (!Object.keys(obj).some(k => !k.startsWith('@')) && node.textContent && node.textContent.trim()) {
    return node.textContent.trim();
  }
  
  return obj;
};

// Get all products
export const getProducts = async () => {
  try {
    const response = await fetch(`${API_URL}/products`, {
      method: 'GET',
      headers: getAuthHeader()
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const xmlData = await response.text();
    const jsonData = parseXML(xmlData);
    
    // Extract product array from response
    let products = jsonData?.prestashop?.products?.product;
    
    if (!products) {
      throw new Error('No products found in response');
    }
    
    // Ensure it's an array
    products = Array.isArray(products) ? products : [products];
    
    console.log('Products extracted:', products);
    return products;
  } catch (error) {
    console.error('Error fetching products:', error);
    throw error;
  }
};

// Get single product details
export const getProductDetails = async (productId) => {
  try {
    const response = await fetch(`${API_URL}/products/${productId}`, {
      method: 'GET',
      headers: getAuthHeader()
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const xmlData = await response.text();
    const jsonData = parseXML(xmlData);
    
    return jsonData.prestashop.product;
  } catch (error) {
    console.error(`Error fetching product ${productId}:`, error);
    throw error;
  }
};
