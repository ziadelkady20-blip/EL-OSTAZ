import { getDb } from '../../lib/db.js';
import { allowMethods, readJson, safeText, sendJson } from '../../lib/http.js';
import { requireAdmin } from '../../lib/auth.js';

function positiveId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function imageUrl(value) {
  const raw = safeText(value, 1000);
  if (!raw) return null;
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error('رابط صورة المنتج غير صحيح'); }
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('رابط صورة المنتج يجب أن يبدأ بـ https:// أو http://');
  return parsed.toString();
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST', 'PATCH'])) return;
  if (!requireAdmin(req, res)) return;

  try {
    const sql = getDb();

    if (req.method === 'GET') {
      const [categories, products] = await Promise.all([
        sql`SELECT id, name, active, created_at, updated_at FROM public.catalog_categories ORDER BY id`,
        sql`SELECT p.id, p.category_id, c.name AS category_name, p.name, p.description, p.price, p.image_url, p.active, p.created_at, p.updated_at
          FROM public.catalog_products p
          INNER JOIN public.catalog_categories c ON c.id = p.category_id
          ORDER BY p.created_at DESC, p.id DESC`,
      ]);
      return sendJson(res, 200, { categories, products });
    }

    const body = await readJson(req);
    const type = safeText(body.type, 20);

    if (req.method === 'PATCH') {
      const id = positiveId(body.id);
      if (!id || typeof body.active !== 'boolean' || !['category', 'product'].includes(type)) {
        return sendJson(res, 400, { error: 'بيانات تحديث الحالة غير صحيحة' });
      }
      const rows = type === 'category'
        ? await sql`UPDATE public.catalog_categories SET active = ${body.active}, updated_at = NOW() WHERE id = ${id} RETURNING id, name, active`
        : await sql`UPDATE public.catalog_products SET active = ${body.active}, updated_at = NOW() WHERE id = ${id} RETURNING id, name, active`;
      if (!rows.length) return sendJson(res, 404, { error: 'العنصر المطلوب غير موجود' });
      return sendJson(res, 200, { ok: true, item: rows[0] });
    }

    if (type === 'category') {
      const name = safeText(body.name, 120);
      if (name.length < 2) return sendJson(res, 400, { error: 'اكتب اسم القسم (حرفان على الأقل)' });
      const id = positiveId(body.id);
      const rows = id
        ? await sql`UPDATE public.catalog_categories SET name = ${name}, updated_at = NOW() WHERE id = ${id} RETURNING id, name, active`
        : await sql`INSERT INTO public.catalog_categories (name, active) VALUES (${name}, TRUE) RETURNING id, name, active`;
      if (!rows.length) return sendJson(res, 404, { error: 'القسم المطلوب غير موجود' });
      return sendJson(res, id ? 200 : 201, { ok: true, item: rows[0] });
    }

    if (type === 'product') {
      const id = positiveId(body.id);
      const categoryId = positiveId(body.categoryId);
      const name = safeText(body.name, 180);
      const description = safeText(body.description, 1500);
      const price = Number(body.price);
      const photo = imageUrl(body.imageUrl);
      const active = typeof body.active === 'boolean' ? body.active : true;
      if (!categoryId || name.length < 2 || !Number.isFinite(price) || price < 0 || price > 100000000) {
        return sendJson(res, 400, { error: 'راجع القسم واسم المنتج والسعر' });
      }
      const category = await sql`SELECT id FROM public.catalog_categories WHERE id = ${categoryId} AND active = TRUE LIMIT 1`;
      if (!category.length) return sendJson(res, 400, { error: 'اختر قسمًا متاحًا' });
      const rows = id
        ? await sql`UPDATE public.catalog_products
            SET category_id = ${categoryId}, name = ${name}, description = ${description || null},
                price = ${price}, image_url = ${photo}, active = ${active}, updated_at = NOW()
            WHERE id = ${id}
            RETURNING id, category_id, name, description, price, image_url, active`
        : await sql`INSERT INTO public.catalog_products (category_id, name, description, price, image_url, active)
            VALUES (${categoryId}, ${name}, ${description || null}, ${price}, ${photo}, ${active})
            RETURNING id, category_id, name, description, price, image_url, active`;
      if (!rows.length) return sendJson(res, 404, { error: 'المنتج المطلوب غير موجود' });
      return sendJson(res, id ? 200 : 201, { ok: true, item: rows[0] });
    }

    return sendJson(res, 400, { error: 'نوع العنصر غير معروف' });
  } catch (error) {
    console.error('admin catalog error', error);
    const message = error?.message || '';
    if (/duplicate key|unique constraint/i.test(message)) {
      return sendJson(res, 409, { error: 'يوجد قسم أو اسم مطابق بالفعل' });
    }
    return sendJson(res, 500, { error: message || 'تعذر حفظ بيانات المتجر' });
  }
}
