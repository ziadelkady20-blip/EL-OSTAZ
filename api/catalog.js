import { getDb } from '../lib/db.js';
import { allowMethods, sendJson } from '../lib/http.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  try {
    const sql = getDb();
    const categories = await sql`SELECT id, name FROM public.catalog_categories WHERE active = TRUE ORDER BY id`;
    const products = await sql`SELECT p.id, p.category_id, c.name AS category_name, p.name, p.description, p.price, p.image_url, p.active
      FROM public.catalog_products p
      INNER JOIN public.catalog_categories c ON c.id = p.category_id
      WHERE c.active = TRUE
      ORDER BY p.created_at DESC, p.id DESC`;
    return sendJson(res, 200, { categories, products });
  } catch (error) {
    console.error('public catalog error', error);
    return sendJson(res, 500, { error: 'تعذر تحميل منتجات المتجر حاليًا' });
  }
}
